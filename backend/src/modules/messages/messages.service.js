import { communityService } from '../community/community.service.js';
import { supportService } from '../support/support.service.js';

export function createMessageNotificationsService({ community = communityService, support = supportService } = {}) {
    return {
        async unread(user) {
            const [room, personal, inbox] = await Promise.all([
                community.unread(user.id),
                support.unread(user.id),
                user.role === 'admin' ? support.adminUnread() : 0,
            ]);
            return { community: room.unread, support: personal, admin: inbox, total: room.unread + personal + inbox };
        },
    };
}

export const messageNotificationsService = createMessageNotificationsService();
