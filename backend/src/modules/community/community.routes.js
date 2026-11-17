import { Router } from 'express';
import { z } from 'zod';
import { ah, parse } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import { communityLimiter } from '../../middleware/rateLimit.js';
import { communityService } from './community.service.js';
import { clientMessageId } from '../messages/delivery.js';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/, 'Mã tin nhắn không hợp lệ.');
const cursor = z.string().regex(/^(?:p\d{1,10}|\d{1,13}_[a-zA-Z0-9_-]{1,60})$/, 'Mốc lịch sử không hợp lệ.').refine((value) => !value.startsWith('p') || Number(value.slice(1)) <= 2147483647, 'Mốc lịch sử không hợp lệ.');
export const communityQuery = z.object({ before: cursor.optional(), after: cursor.optional(), since: z.coerce.number().int().min(0).max(8640000000000000).optional() }).refine((query) => !(query.before && query.after), 'Chỉ dùng một hướng phân trang.');
export const communityBody = z.object({ body: z.string({ error: 'Vui lòng nhập tin nhắn.' }).trim().min(1, 'Vui lòng nhập tin nhắn.').max(2000, 'Tin nhắn tối đa 2000 ký tự.'), clientMessageId });

export function createCommunityRoutes({ service = communityService, authenticate = requireAuth, limiter = communityLimiter } = {}) {
    const routes = Router();
    routes.use(authenticate);
    routes.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    routes.get('/messages', ah(async (req, res) => res.json(await service.list(parse(communityQuery, req.query), req.user.id))));
    routes.post('/read', ah(async (req, res) => res.json(await service.markRead(req.user.id, parse(z.object({ messageId: id }), req.body).messageId))));
    routes.post('/messages', limiter, ah(async (req, res) => {
        const input = parse(communityBody, req.body);
        res.status(201).json(await service.send(req.user, input.body, input.clientMessageId));
    }));
    routes.delete('/messages/:id', limiter, ah(async (req, res) => res.json(await service.remove(req.user, parse(id, req.params.id)))));
    return routes;
}

export const communityRoutes = createCommunityRoutes();
