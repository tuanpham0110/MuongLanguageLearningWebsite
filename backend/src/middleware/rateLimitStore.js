import { createHmac } from 'node:crypto';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { unavailable } from '../lib/errors.js';

/** express-rate-limit Store backed by one atomic PostgreSQL statement per hit. */
export class PostgresRateLimitStore {
    localKeys = false;

    constructor(prefix, db = prisma) {
        this.prefix = prefix;
        this.db = db;
    }

    init({ windowMs }) { this.windowMs = windowMs; }

    keyFor(key) {
        return createHmac('sha256', env.JWT_SECRET).update(JSON.stringify([this.prefix, key])).digest('hex');
    }

    async increment(key) {
        const digest = this.keyFor(key);
        try {
            // Database time avoids different function instances disagreeing on expiration.
            const [row] = await this.db.$queryRaw`
                INSERT INTO "RequestRateLimit" ("key", "hits", "resetAt")
                VALUES (${digest}, 1, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + ${this.windowMs} * INTERVAL '1 millisecond')
                ON CONFLICT ("key") DO UPDATE SET
                    "hits" = CASE WHEN "RequestRateLimit"."resetAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN 1 ELSE "RequestRateLimit"."hits" + 1 END,
                    "resetAt" = CASE WHEN "RequestRateLimit"."resetAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
                        THEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + ${this.windowMs} * INTERVAL '1 millisecond' ELSE "RequestRateLimit"."resetAt" END
                RETURNING "hits", "resetAt"`;
            // Bounded cleanup; awaited so serverless shutdown cannot silently drop it.
            if (Math.random() < 0.01) await this.db.$executeRaw`
                DELETE FROM "RequestRateLimit" WHERE "key" IN (
                    SELECT "key" FROM "RequestRateLimit" WHERE "resetAt" < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '1 day'
                    ORDER BY "resetAt" LIMIT 100
                )`;
            return { totalHits: row.hits, resetTime: new Date(row.resetAt) };
        } catch {
            // Never silently fall back to a per-instance store when shared enforcement is down.
            throw unavailable('Chưa kiểm tra được hạn mức yêu cầu. Vui lòng thử lại sau.', { code: 'rate-limit-unavailable' });
        }
    }

    async decrement(key) {
        const digest = this.keyFor(key);
        await this.db.$executeRaw`UPDATE "RequestRateLimit" SET "hits" = GREATEST(0, "hits" - 1) WHERE "key" = ${digest}`;
    }

    async resetKey(key) {
        const digest = this.keyFor(key);
        await this.db.$executeRaw`DELETE FROM "RequestRateLimit" WHERE "key" = ${digest}`;
    }
}
