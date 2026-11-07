import type { RequestHandler } from './$types';
import { fail, requireUser, v1 } from '#lib/server/api.js';
import { markNotificationRead } from '#lib/server/notifications.js';
import { parseId } from '#lib/server/validation.js';

/** Marks one notification read. */
export const POST: RequestHandler = v1(async ({ locals, params }) => {
	const user = requireUser(locals);
	const id = parseId(params.id) ?? fail(404, 'Notification not found');
	if (!(await markNotificationRead(user.id, id))) fail(404, 'Notification not found');
});
