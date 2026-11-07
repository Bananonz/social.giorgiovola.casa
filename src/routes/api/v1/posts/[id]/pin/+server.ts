import type { RequestHandler } from './$types';
import { fail, rateLimit, requireUser, v1 } from '#lib/server/api.js';
import { setPinned } from '#lib/server/posts.js';
import { parseId } from '#lib/server/validation.js';

const pin = (pinned: boolean): RequestHandler =>
	v1(async ({ locals, params }) => {
		const user = requireUser(locals);
		const id = parseId(params.id) ?? fail(404, 'Post not found');
		rateLimit(`pin:${user.id}`, 30);
		return (
			(await setPinned(user.id, id, pinned)) ??
			fail(404, 'You can only pin your own posts, not replies')
		);
	});

/** Pins one of your posts to your profile, replacing the pinned one. */
export const PUT = pin(true);
/** Unpins it. */
export const DELETE = pin(false);
