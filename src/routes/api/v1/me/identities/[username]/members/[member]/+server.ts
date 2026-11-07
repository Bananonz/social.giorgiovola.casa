import type { RequestHandler } from './$types';
import { requireAccount, usernameParam, v1 } from '#lib/server/api.js';
import { unshareIdentity } from '#lib/server/identities.js';

/** Stops sharing the identity with that account. Owner only. */
export const DELETE: RequestHandler = v1(({ locals, params }) =>
	unshareIdentity(
		requireAccount(locals).accountId,
		usernameParam(params.username),
		usernameParam(params.member)
	)
);
