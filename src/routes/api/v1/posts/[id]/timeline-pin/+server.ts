import type { RequestHandler } from './$types';
import { fail, requireStaff, v1 } from '#lib/server/api.js';
import { actionsLimited } from '#lib/server/moderation.js';
import { setTimelinePinned } from '#lib/server/posts.js';
import { parseId } from '#lib/server/validation.js';

const pin = (pinned: boolean): RequestHandler =>
	v1(async ({ locals, params }) => {
		const { accountId } = requireStaff(locals);
		const id = parseId(params.id) ?? fail(404, 'Post not found');
		if (actionsLimited(accountId)) fail(429, 'Slow down');
		const result = await setTimelinePinned(id, pinned);
		if ('message' in result) fail(result.status as number, result.message as string);
		return result;
	});

/** Staff only: pins a top-level post above the home timeline for everyone (at most 3). */
export const PUT = pin(true);
/** Staff only: unpins it. */
export const DELETE = pin(false);
