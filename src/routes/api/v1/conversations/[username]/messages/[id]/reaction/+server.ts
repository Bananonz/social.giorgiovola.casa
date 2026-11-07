import type { RequestHandler } from './$types';
import { fail, readJson, requireUser, usernameParam, v1 } from '#lib/server/api.js';
import { reactDirect } from '#lib/server/chat.js';
import { parseId } from '#lib/server/validation.js';

/** Sets your reaction to a message: `{ emoji }` (one emoji), replacing the one you had. */
export const PUT: RequestHandler = v1(async ({ locals, params, request }) => {
	const me = requireUser(locals);
	const emoji = (await readJson(request)).emoji ?? '';
	const id = parseId(params.id) ?? fail(404, 'Message not found');
	return reactDirect(me, usernameParam(params.username), id, emoji);
});

/** Removes your reaction. */
export const DELETE: RequestHandler = v1(({ locals, params }) =>
	reactDirect(
		requireUser(locals),
		usernameParam(params.username),
		parseId(params.id) ?? fail(404, 'Message not found'),
		null
	)
);
