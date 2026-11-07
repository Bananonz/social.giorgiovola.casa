import type { RequestHandler } from './$types';
import { requireUser, v1 } from '#lib/server/api.js';
import { unreadCounts } from '#lib/server/notifications.js';

/** `{ notifications, messages }`: unread notifications and unread messages (muted chats left out). */
export const GET: RequestHandler = v1(({ locals }) => unreadCounts(requireUser(locals).id));
