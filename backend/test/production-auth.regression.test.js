import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

Object.assign(process.env, {
    NODE_ENV: 'production', DATABASE_URL: 'postgresql://unit:unit@127.0.0.1:1/security_test',
    JWT_SECRET: 'isolated-production-auth-test-secret-over-32-characters',
});
for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) process.env[key] = '';
const { env } = await import('../src/config/env.js');
const { prisma } = await import('../src/lib/prisma.js');
const { authService } = await import('../src/modules/auth/auth.service.js');
const { sendOtpMail } = await import('../src/lib/mailer.js');

test('SEC-01 production without SMTP still requires verification', () => {
    assert.equal(env.mailEnabled, false);
    assert.equal(env.verificationRequired, true);
});

test('SEC-01 registration without delivery returns 503 before touching an account', async (t) => {
    const original = prisma.user;
    prisma.user = { findUnique: async () => assert.fail('registration must not modify or query an account') };
    t.after(() => { prisma.user = original; });
    await assert.rejects(authService.register({ name: 'Test Owner', email: 'owner@example.invalid', password: 'password123' }), { status: 503, code: 'mail-disabled' });
});

test('SEC-01 pending login cannot silently verify; verified users can still sign in', async (t) => {
    const user = { id: 'owner', name: 'Owner', email: 'owner@example.invalid', role: 'user', passwordHash: await bcrypt.hash('password123', 4), passwordChangedAt: null, verified: false };
    const original = prisma.user;
    prisma.user = { findUnique: async () => ({ ...user }), update: async () => assert.fail('login cannot verify an email') };
    t.after(() => { prisma.user = original; });
    await assert.rejects(authService.login({ email: user.email, password: 'password123' }), { status: 503, code: 'mail-disabled' });
    user.verified = true;
    assert.ok((await authService.login({ email: user.email, password: 'password123' })).token);
});

test('SEC-01 mailer never logs OTP in production when delivery is unavailable', async (t) => {
    t.mock.method(console, 'warn', () => assert.fail('OTP must not be logged'));
    await assert.rejects(sendOtpMail('owner@example.invalid', '123456', 'verify'), { code: 'mail-disabled' });
});
