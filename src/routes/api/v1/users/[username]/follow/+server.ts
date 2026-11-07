import type { RequestHandler } from './$types';
import { fail, rateLimit, requireUser, usernameParam, v1 } from '#lib/server/api.js';
import { getFollowStats, setFollowing } from '#lib/server/follows.js';
import { findPeer } from '#lib/server/messages.js';
import { publishFollow } from '#lib/server/realtime.js';

const MAX_TOGGLES = 30;

const follow = (following: boolean): RequestHandler =>
	v1(async ({ locals, params }) => {
		const user = requireUser(locals);
		const target = (await findPeer(usernameParam(params.username))) ?? fail(404, 'User not found');
		if (target.id === user.id) fail(400, "You can't follow yourself");
		rateLimit(`follow:${user.id}`, MAX_TOGGLES);
		// the trigger created the notification
		if (await setFollowing(user.id, target.id, following)) void publishFollow(user.id, target.id);
		return getFollowStats(target.id, user.id);
	});

/** Follows the profile. Idempotent. Answers its counts and `followed`. */
export const PUT = follow(true);
/** Unfollows it. */
export const DELETE = follow(false);
