import type { RequestHandler } from './$types';
import { fail, usernameParam, v1 } from '#lib/server/api.js';
import { getProfileCard } from '#lib/server/follows.js';

/** What the profile hover card shows. Public like the profile; mutuals only when signed in. */
export const GET: RequestHandler = v1(async ({ locals, params }) => {
	return (
		(await getProfileCard(usernameParam(params.username), locals.user?.id)) ??
		fail(404, 'User not found')
	);
});
