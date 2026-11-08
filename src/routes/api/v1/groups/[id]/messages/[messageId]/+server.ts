import type { RequestHandler } from './$types';
import { fail, readJson, requireUnmuted, requireUser, v1 } from '#lib/server/api.js';
import { deleteFromGroup, editInGroup } from '#lib/server/chat.js';
import { parseId } from '#lib/server/validation.js';

/** Changes the text of one of your own messages, within an hour of sending it: `{ content }`. */
export const PATCH: RequestHandler = v1(async ({ locals, params, request }) =>
	editInGroup(
		requireUnmuted(locals),
		parseId(params.id),
		parseId(params.messageId) ?? fail(404, 'Message not found'),
		await readJson(request)
	)
);

/** Deletes one of your own messages in the group, for everyone. */
export const DELETE: RequestHandler = v1(({ locals, params }) =>
	deleteFromGroup(
		requireUser(locals),
		parseId(params.id),
		parseId(params.messageId) ?? fail(404, 'Message not found')
	)
);
