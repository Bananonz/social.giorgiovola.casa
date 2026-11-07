import type { RequestHandler } from './$types';
import { fail, usernameParam, v1 } from '#lib/server/api.js';
import { getProfile } from '#lib/server/users.js';

/**
 * A profile: name, bio, website, counts, whether you follow each other, mutuals, blocks, the
 * pinned post id and (staff only) its moderation state. Public; relationship fields need a sign-in.
 */
export const GET: RequestHandler = v1(async ({ locals, params }) => {
	return (await getProfile(usernameParam(params.username), locals)) ?? fail(404, 'User not found');
});
