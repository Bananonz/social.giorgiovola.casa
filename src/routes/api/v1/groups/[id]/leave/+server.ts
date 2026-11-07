import type { RequestHandler } from './$types';
import { requireUser, v1 } from '#lib/server/api.js';
import { removeFromGroup } from '#lib/server/chat.js';
import { parseId } from '#lib/server/validation.js';

/** Leaves the group. The last member to leave deletes it. */
export const POST: RequestHandler = v1(({ locals, params }) => {
	const me = requireUser(locals);
	return removeFromGroup(me, parseId(params.id), me.username);
});
