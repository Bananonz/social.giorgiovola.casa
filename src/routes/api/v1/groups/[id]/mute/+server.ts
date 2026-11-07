import type { RequestHandler } from './$types';
import { requireUser, v1 } from '#lib/server/api.js';
import { muteGroup } from '#lib/server/chat.js';
import { parseId } from '#lib/server/validation.js';

/** Mutes the group for you: no push, and it stays out of the unread badge. */
export const PUT: RequestHandler = v1(({ locals, params }) =>
	muteGroup(requireUser(locals), parseId(params.id), true)
);
/** Unmutes it. */
export const DELETE: RequestHandler = v1(({ locals, params }) =>
	muteGroup(requireUser(locals), parseId(params.id), false)
);
