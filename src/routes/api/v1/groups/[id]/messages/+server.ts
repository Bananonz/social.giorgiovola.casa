import type { RequestHandler } from './$types';
import { created, idCursor, requireUnmuted, requireUser, v1 } from '#lib/server/api.js';
import { groupMessages, sendToGroup } from '#lib/server/chat.js';
import { parseId } from '#lib/server/validation.js';

/**
 * Messages and events of the group, oldest first, 30 at a time: the latest ones, then older ones
 * with `?cursor=`. Nothing is marked read.
 */
export const GET: RequestHandler = v1(({ locals, params, url }) =>
	groupMessages(requireUser(locals), parseId(params.id), idCursor(url))
);

/** Sends a message: JSON `{ content, uploads?, reply_to? }`, or multipart with `images`. */
export const POST: RequestHandler = v1(async ({ locals, params, request }) =>
	created(await sendToGroup(requireUnmuted(locals), parseId(params.id), request))
);
