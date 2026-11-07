import type { RequestHandler } from './$types';
import { v1 } from '#lib/server/api.js';
import { getTimelinePinned } from '#lib/server/posts.js';

/** The posts staff pinned above the home timeline (at most 3), the most recently pinned first. */
export const GET: RequestHandler = v1(async ({ locals }) => ({
	items: await getTimelinePinned(locals.user),
	next_cursor: null
}));
