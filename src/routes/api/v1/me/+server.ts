import type { RequestHandler } from './$types';
import { fail, readJson, requireUser, v1 } from '#lib/server/api.js';
import { updateMe } from '#lib/server/login.js';
import { meOf } from '#lib/server/me.js';

/** The profile in use, the account behind it, moderation state and unread counts. */
export const GET: RequestHandler = v1(({ locals }) => meOf(locals));

const FIELDS = ['name', 'username', 'bio', 'website', 'email'] as const;

/**
 * Edits the profile in use: any of `name`, `username`, `bio`, `website`, and `email` (accounts
 * only). Fields left out are kept. Bots use PATCH /api/bot/me (or this, without email).
 */
export const PATCH: RequestHandler = v1(async ({ locals, request }) => {
	const user = requireUser(locals);
	const body = await readJson(request);
	const changes: Partial<Record<(typeof FIELDS)[number], string>> = {};
	for (const field of FIELDS) {
		const value = body[field];
		if (value === undefined) continue;
		if (typeof value !== 'string') fail(400, `${field} must be a string`);
		changes[field] = value;
	}
	if (Object.keys(changes).length === 0)
		fail(400, `Nothing to update, send any of ${FIELDS.join(', ')}`);
	if (locals.auth === 'bot' && changes.email !== undefined) fail(400, 'Bots have no email');
	await updateMe(user, changes);
	return meOf(locals);
});
