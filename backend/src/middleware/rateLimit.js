import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { PostgresRateLimitStore } from './rateLimitStore.js';

const message = (text) => ({ message: text, code: 'rate-limited' });
const sharedStore = (prefix) => env.isProd ? { store: new PostgresRateLimitStore(prefix), passOnStoreError: false } : {};

/** Login / register / OTP – slows down brute force. */
export const authLimiter = rateLimit({
    ...sharedStore('auth'),
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: message('Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.'),
});

/** General API ceiling per IP. */
export const apiLimiter = rateLimit({
    ...sharedStore('api'),
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: message('Quá nhiều yêu cầu. Vui lòng chậm lại một chút.'),
});

/** AI chat – per signed-in user. */
export const aiLimiter = rateLimit({
    ...sharedStore('ai'),
    windowMs: 60 * 1000,
    limit: 12,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id ?? req.ip,
    message: message('Bạn hỏi hơi nhanh. Đợi vài giây rồi hỏi tiếp nhé.'),
});

/** Messages to support – per signed-in user. */
export const supportLimiter = rateLimit({
    ...sharedStore('support'),
    windowMs: 10 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id ?? req.ip,
    message: message('Bạn gửi tin hơi nhanh. Vui lòng đợi ít phút rồi gửi tiếp.'),
});

/** Shared learning room – separate from private support and keyed to the signed-in user. */
export const communityLimiter = rateLimit({
    ...sharedStore('community'),
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.user.id,
    message: message('Bạn gửi tin hơi nhanh. Đợi một chút rồi gửi tiếp nhé.'),
});
