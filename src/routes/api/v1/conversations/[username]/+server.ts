import type { RequestHandler } from './$types';
import { requireUser, usernameParam, v1 } from '#lib/server/api.js';
import { getConversation } from '#lib/server/chat.js';

/** The conversation with a profile: who it is, blocks either way and whether you muted it. */
export const GET: RequestHandler = v1(({ locals, params }) =>
	getConversation(requireUser(locals), usernameParam(params.username))
);
