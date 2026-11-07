import type { RequestHandler } from './$types';
import { requireUser, v1 } from '#lib/server/api.js';
import { followedUsernames } from '#lib/server/follows.js';

/** Usernames of every profile the profile in use follows (to filter realtime posts). */
export const GET: RequestHandler = v1(async ({ locals }) => ({
	items: await followedUsernames(requireUser(locals).id)
}));
