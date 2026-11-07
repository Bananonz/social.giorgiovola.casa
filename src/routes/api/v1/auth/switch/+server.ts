import type { RequestHandler } from './$types';
import {
	rateLimit,
	readJson,
	requireAccount,
	stringField,
	usernameParam,
	v1
} from '#lib/server/api.js';
import { switchProfile } from '#lib/server/me.js';

const MAX_SWITCHES = 30;

/**
 * Switches the profile in use: `{ username }` of the account itself, one of its identities or an
 * identity shared with it. In the browser it can also be another account signed in there.
 */
export const POST: RequestHandler = v1(async ({ locals, request, cookies }) => {
	const { accountId } = requireAccount(locals);
	// each switch writes the session and closes its streams
	rateLimit(`switch:${accountId}`, MAX_SWITCHES, 60_000, 'Switching too often');
	const username = usernameParam(stringField(await readJson(request), 'username'));
	return switchProfile(locals, cookies, username);
});
