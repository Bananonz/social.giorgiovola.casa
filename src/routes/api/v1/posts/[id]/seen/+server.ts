import type { RequestHandler } from './$types';
import { fail, requireUser, v1 } from '#lib/server/api.js';
import { markPostSeen } from '#lib/server/notifications.js';
import { parseId } from '#lib/server/validation.js';

/** The post was on your screen: your mention notification for it is now read. */
export const POST: RequestHandler = v1(async ({ locals, params }) => {
	const user = requireUser(locals);
	await markPostSeen(user.id, parseId(params.id) ?? fail(404, 'Post not found'));
});
