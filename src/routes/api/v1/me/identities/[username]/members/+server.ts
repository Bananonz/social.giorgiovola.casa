import type { RequestHandler } from './$types';
import {
	created,
	readJson,
	requireAccount,
	stringField,
	usernameParam,
	v1
} from '#lib/server/api.js';
import { shareIdentity } from '#lib/server/identities.js';

/** Shares the identity with another account: `{ username }`. Owner only. */
export const POST: RequestHandler = v1(async ({ locals, params, request }) => {
	const { accountId } = requireAccount(locals);
	const member = stringField(await readJson(request), 'username');
	return created(await shareIdentity(accountId, usernameParam(params.username), member));
});
