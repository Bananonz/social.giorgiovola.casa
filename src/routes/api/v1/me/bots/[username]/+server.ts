import type { RequestHandler } from './$types';
import { fail, readJson, requireAccount, usernameParam, v1 } from '#lib/server/api.js';
import { deleteBot, editBot } from '#lib/server/bots.js';
import type { ProfileChanges } from '#lib/server/profile.js';

const FIELDS = ['name', 'username', 'bio', 'website'] as const;

/** Edits a bot's profile: any of `name`, `username`, `bio`, `website`. */
export const PATCH: RequestHandler = v1(async ({ locals, params, request }) => {
	const { accountId } = requireAccount(locals);
	const body = await readJson(request);
	const changes: ProfileChanges = {};
	for (const field of FIELDS) {
		const value = body[field];
		if (value === undefined) continue;
		if (typeof value !== 'string') fail(400, `${field} must be a string`);
		changes[field] = value;
	}
	if (Object.keys(changes).length === 0)
		fail(400, `Nothing to update, send any of ${FIELDS.join(', ')}`);
	return editBot(accountId, usernameParam(params.username), changes);
});

/** Permanently deletes a bot with its posts. */
export const DELETE: RequestHandler = v1(({ locals, params }) =>
	deleteBot(requireAccount(locals).accountId, usernameParam(params.username))
);
