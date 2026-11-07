import type { RequestHandler } from './$types';
import {
	created,
	fail,
	rateLimit,
	readJson,
	requireAccount,
	stringField,
	v1
} from '#lib/server/api.js';
import { checkCurrentPassword } from '#lib/server/login.js';
import { MAX_PERSONAL_TOKENS, countPersonalTokens, createToken } from '#lib/server/session.js';

const NAME_MAX = 64;
const MAX_DAYS = 3650;

/**
 * Creates a personal access token: `{ name, current_password, expires_in_days? }` (1 to 3650, or
 * null for a token that never expires; default 90). The password is asked again so a stolen
 * session or token can't mint itself lasting access. The token is only in this response.
 */
export const POST: RequestHandler = v1(async ({ locals, request }) => {
	const { accountId } = requireAccount(locals);
	const body = await readJson(request);
	const name = stringField(body, 'name').trim();
	if (!name || name.length > NAME_MAX) fail(400, `name must be 1 to ${NAME_MAX} characters`);
	const rawDays = body.expires_in_days === undefined ? 90 : body.expires_in_days;
	if (
		rawDays !== null &&
		(typeof rawDays !== 'number' || !Number.isInteger(rawDays) || rawDays < 1 || rawDays > MAX_DAYS)
	)
		fail(400, `expires_in_days must be a whole number from 1 to ${MAX_DAYS}, or null`);

	rateLimit(`tokens:${accountId}`, 10, 60_000, 'Too many tokens created');
	await checkCurrentPassword(accountId, stringField(body, 'current_password'));
	if ((await countPersonalTokens(accountId)) >= MAX_PERSONAL_TOKENS)
		fail(400, `You can have at most ${MAX_PERSONAL_TOKENS} personal access tokens.`);
	const { token, id, expires_at } = await createToken(accountId, {
		kind: 'personal',
		name,
		userAgent: request.headers.get('user-agent'),
		days: rawDays as number | null
	});
	return created({ id, name, token, token_type: 'Bearer', expires_at });
});
