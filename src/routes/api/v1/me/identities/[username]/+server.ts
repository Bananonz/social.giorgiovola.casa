import type { RequestHandler } from './$types';
import { requireAccount, usernameParam, v1 } from '#lib/server/api.js';
import { deleteIdentity } from '#lib/server/identities.js';

/** Permanently deletes one of the account's identities with its posts. Owner only. */
export const DELETE: RequestHandler = v1(({ locals, params }) =>
	deleteIdentity(requireAccount(locals).accountId, usernameParam(params.username))
);
