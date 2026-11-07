import type { RequestHandler } from './$types';
import { fail, rateLimit, requireUser, usernameParam, v1 } from '#lib/server/api.js';
import { findPeer, getBlock, setBlocked } from '#lib/server/messages.js';

const block = (blocked: boolean): RequestHandler =>
	v1(async ({ locals, params }) => {
		const user = requireUser(locals);
		const target = (await findPeer(usernameParam(params.username))) ?? fail(404, 'User not found');
		if (target.id === user.id) fail(400, "You can't block yourself");
		rateLimit(`blocks:${user.id}`, 30);
		await setBlocked(user.id, target.id, blocked);
		const state = await getBlock(user.id, target.id);
		return { blocked: state.me, blocks_you: state.peer };
	});

/** Blocks the profile: no direct messages in either direction. Idempotent. */
export const PUT = block(true);
/** Unblocks it. */
export const DELETE = block(false);
