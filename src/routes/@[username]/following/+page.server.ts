import type { PageServerLoad } from './$types';
import { loadFollowList } from '#lib/followPage.js';

export const load = (async ({ params, fetch, parent }) =>
	loadFollowList(
		fetch,
		params.username,
		'following',
		!!(await parent()).user
	)) satisfies PageServerLoad;
