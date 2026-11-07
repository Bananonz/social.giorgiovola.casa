import type { RequestHandler } from './$types';
import { requireUser, usernameParam, v1 } from '#lib/server/api.js';
import { readDirect } from '#lib/server/chat.js';

/** Marks everything this profile sent you as read. */
export const POST: RequestHandler = v1(({ locals, params }) =>
	readDirect(requireUser(locals), usernameParam(params.username))
);
