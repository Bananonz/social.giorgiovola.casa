import type { RequestHandler } from './$types';
import { requireUser, usernameParam, v1 } from '#lib/server/api.js';
import { typingDirect } from '#lib/server/chat.js';

/** Shows a typing indicator to the other side (send every few seconds while writing). */
export const POST: RequestHandler = v1(({ locals, params }) =>
	typingDirect(locals, requireUser(locals), usernameParam(params.username))
);
