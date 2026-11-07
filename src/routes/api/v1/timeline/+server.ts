import type { RequestHandler } from './$types';
import { fail, offsetPage, offsetParams, requireUser, v1 } from '#lib/server/api.js';
import { homeTimeline } from '#lib/server/feeds.js';

/**
 * The home timeline, newest first: `?feed=all` (every top-level post, the default) or
 * `?feed=following` (posts and regiorgs of the profiles you follow, and your own; signed in only).
 * Posts pinned to the timeline are left out: they come from GET /timeline/pinned.
 */
export const GET: RequestHandler = v1(async ({ locals, url }) => {
	const feed = url.searchParams.get('feed') ?? 'all';
	if (feed !== 'all' && feed !== 'following') fail(400, 'feed must be "all" or "following"');
	if (feed === 'following') requireUser(locals);
	const { limit, offset } = offsetParams(url);
	return offsetPage(await homeTimeline(feed, locals.user, limit, offset), limit, offset);
});
