import type { RequestHandler } from './$types';
import { fail, readJson, requireUser, v1 } from '#lib/server/api.js';
import { reactInGroup } from '#lib/server/chat.js';
import { parseId } from '#lib/server/validation.js';

/** Sets your reaction to a group message: `{ emoji }`, replacing the one you had. */
export const PUT: RequestHandler = v1(async ({ locals, params, request }) => {
	const me = requireUser(locals);
	const emoji = (await readJson(request)).emoji ?? '';
	const id = parseId(params.messageId) ?? fail(404, 'Message not found');
	return reactInGroup(me, parseId(params.id), id, emoji);
});

/** Removes your reaction. */
export const DELETE: RequestHandler = v1(({ locals, params }) =>
	reactInGroup(
		requireUser(locals),
		parseId(params.id),
		parseId(params.messageId) ?? fail(404, 'Message not found'),
		null
	)
);
