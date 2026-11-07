import type { RequestHandler } from './$types';
import {
	created,
	idCursor,
	requireUnmuted,
	requireUser,
	usernameParam,
	v1
} from '#lib/server/api.js';
import { conversationMessages, sendDirect } from '#lib/server/chat.js';

/**
 * Messages of the conversation, oldest first, 30 at a time: the latest ones, then older ones
 * with `?cursor=` (the `next_cursor` of the previous page). Nothing is marked read.
 */
export const GET: RequestHandler = v1(({ locals, params, url }) =>
	conversationMessages(requireUser(locals), usernameParam(params.username), idCursor(url))
);

/**
 * Sends a message: JSON `{ content, uploads?, reply_to? }` (`uploads` are ids from POST /uploads),
 * or multipart with `content`, `images` files and `reply_to` for browsers.
 */
export const POST: RequestHandler = v1(async ({ locals, params, request }) =>
	created(await sendDirect(locals, requireUnmuted(locals), usernameParam(params.username), request))
);
