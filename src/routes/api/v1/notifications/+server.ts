import type { RequestHandler } from './$types';
import { offsetPage, offsetParams, requireUser, v1 } from '#lib/server/api.js';
import { listNotifications } from '#lib/server/notifications.js';

/** Your notifications, newest first (`?limit=` default 50, at most 200). */
export const GET: RequestHandler = v1(async ({ locals, url }) => {
	const user = requireUser(locals);
	const { limit, offset } = offsetParams(url, 50, 200);
	return offsetPage(await listNotifications(user.id, limit, offset), limit, offset);
});
