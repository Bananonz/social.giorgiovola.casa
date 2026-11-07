import type { RequestHandler } from './$types';
import { requireUser, usernameParam, v1 } from '#lib/server/api.js';
import { muteDirect } from '#lib/server/chat.js';

/** Mutes the conversation for you: no push, and it stays out of the unread badge. */
export const PUT: RequestHandler = v1(({ locals, params }) =>
	muteDirect(requireUser(locals), usernameParam(params.username), true)
);
/** Unmutes it. */
export const DELETE: RequestHandler = v1(({ locals, params }) =>
	muteDirect(requireUser(locals), usernameParam(params.username), false)
);
