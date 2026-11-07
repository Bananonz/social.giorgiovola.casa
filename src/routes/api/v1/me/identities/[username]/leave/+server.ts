import type { RequestHandler } from './$types';
import { requireAccount, usernameParam, v1 } from '#lib/server/api.js';
import { leaveIdentity } from '#lib/server/identities.js';

/** Gives back an identity someone else shared with the account. */
export const POST: RequestHandler = v1(({ locals, params }) =>
	leaveIdentity(requireAccount(locals).accountId, usernameParam(params.username))
);
