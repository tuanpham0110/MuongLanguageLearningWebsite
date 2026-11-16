import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function dedicated(value) {
    try { const url = new URL(value); return ['postgres:', 'postgresql:'].includes(url.protocol) && /(?:^|[_-])test$/i.test(url.pathname.slice(1)); }
    catch { return false; }
}
if (process.env.RUN_DB_TESTS !== 'true' || !dedicated(process.env.TEST_DATABASE_URL)) {
    test('OTP concurrency regression requires explicit opt-in and dedicated *_test DB', { skip: true }, () => {});
} else {
    Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL, JWT_SECRET: crypto.randomBytes(48).toString('hex'), OTP_RESEND_SECONDS: '0' });
    // Empty values prevent Prisma's dotenv loader from restoring real SMTP settings.
    for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) process.env[key] = '';
    const { prisma } = await import('../src/lib/prisma.js');
    const { authService } = await import('../src/modules/auth/auth.service.js');
    const { logger } = await import('../src/lib/logger.js');
    const { env } = await import('../src/config/env.js');
    const { credentialVersion } = await import('../src/lib/jwt.js');

    test('SEC-02 concurrent OTP resends leave exactly one active code and old codes cannot verify', async (t) => {
        assert.equal(env.mailEnabled, false, 'this test must never contact SMTP');
        const email = `otp-race-${crypto.randomUUID()}@test.local`;
        const codes = [];
        const originalOtp = prisma.otpCode;
        let delayReads = false;
        let reads = 0;
        let release;
        let timer;
        const gate = new Promise((resolve) => { release = resolve; });
        prisma.otpCode = new Proxy(originalOtp, { get(target, key) {
            if (key !== 'findFirst') return target[key];
            return async (args) => {
                const row = await originalOtp.findFirst(args);
                if (delayReads && ++reads <= 2) {
                    // Exercise the actual read/write race; serialized implementations proceed
                    // after the short bound without requiring a second transaction to enter.
                    if (reads === 1) timer = setTimeout(release, 200);
                    else { clearTimeout(timer); release(); }
                    await gate;
                }
                return row;
            };
        } });
        t.after(() => { clearTimeout(timer); prisma.otpCode = originalOtp; });
        t.mock.method(logger, 'warn', (message) => {
            const match = /: (\d{6})$/.exec(message);
            if (match) codes.push(match[1]);
        });
        try {
            const registration = await authService.register({ name: 'OTP concurrency fixture', email, password: 'FixturePassword123' });
            const input = { email, purpose: 'verify', verificationToken: registration.verificationToken };
            delayReads = true;
            await Promise.all([authService.resendOtp(input), authService.resendOtp(input)]);
            assert.equal(await prisma.otpCode.count({ where: { email, purpose: 'verify', consumedAt: null } }), 1);
            assert.equal(codes.length, 3);
            const user = await prisma.user.findUniqueOrThrow({ where: { email } });
            const active = await prisma.otpCode.findFirstOrThrow({ where: { email, purpose: 'verify', consumedAt: null } });
            const validCode = codes.find((code) => crypto.createHmac('sha256', env.JWT_SECRET).update(JSON.stringify([email, 'verify', code, credentialVersion(user)])).digest('hex') === active.codeHash);
            assert.ok(validCode, 'one delivered fixture code must correspond to the active row');
            for (const code of codes) if (code !== validCode) {
                await assert.rejects(authService.verifyOtp({ ...input, code }), { code: 'otp-wrong' });
            }
            assert.equal((await authService.verifyOtp({ ...input, code: validCode })).verified, true);
        } finally {
            await prisma.otpCode.deleteMany({ where: { email } });
            await prisma.user.deleteMany({ where: { email } });
            await prisma.$disconnect();
        }
    });
}
