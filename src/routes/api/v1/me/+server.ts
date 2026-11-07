import type { RequestHandler } from './$types';
import { fail, rateLimit, readJson, requireUser, stringField, v1 } from '#lib/server/api.js';
import { MAX_PROFILE_UPDATES, PROFILE_WINDOW_MS, botLimited } from '#lib/server/bots.js';
import { updateMe } from '#lib/server/login.js';
import { closeBotStreams } from '#lib/server/realtime.js';
import { meOf } from '#lib/server/me.js';

/** The profile in use, the account behind it, moderation state and unread counts. */
export const GET: RequestHandler = v1(({ locals }) => meOf(locals));

// people edit by hand; this only stops scripts churning usernames
const MAX_PERSON_UPDATES = 30;

const FIELDS = ['name', 'username', 'bio', 'website', 'email'] as const;

/**
 * Edits the profile in use: any of `name`, `username`, `bio`, `website`, and `email` (accounts
 * only; a new email also needs `current_password`). Fields left out are kept. Bots use
 * PATCH /api/bot/me (or this, without email).
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
	// bots share the bot API's profile edit limit
	if (
		locals.auth === 'bot' &&
		botLimited(user.id, 'profile', MAX_PROFILE_UPDATES, PROFILE_WINDOW_MS)
	)
		fail(429, 'Updating the profile too often', {
			'Retry-After': String(PROFILE_WINDOW_MS / 1000)
		});
	if (locals.auth !== 'bot')
		rateLimit(
			`profile:${user.id}`,
			MAX_PERSON_UPDATES,
			PROFILE_WINDOW_MS,
			'Updating the profile too often'
		);
	const updated = await updateMe(user, changes, stringField(body, 'current_password'));
	// a bot stream matches mentions against the username it was opened with
	if (locals.auth === 'bot' && updated.username !== user.username) closeBotStreams([user.id]);
	return meOf(locals);
});
