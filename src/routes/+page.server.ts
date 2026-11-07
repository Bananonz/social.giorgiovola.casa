import type { PageServerLoad } from './$types';
import type { Cookies } from '@sveltejs/kit';
import type { Page } from '#lib/api.js';
import { apiGet } from '#lib/apiLoad.js';
import type { Post } from '#lib/types.js';

type Feed = 'all' | 'following';

const PAGE_SIZE = 10;

// the chosen feed is remembered in a cookie (a UI preference), so the home page opens on it next time
function pickFeed(url: URL, cookies: Cookies, signedIn: boolean): Feed {
	if (!signedIn) return 'all';
	const param = url.searchParams.get('feed');
	if (param === 'all' || param === 'following') {
		if (cookies.get('feed') !== param)
			cookies.set('feed', param, { path: '/', maxAge: 60 * 60 * 24 * 365, httpOnly: true });
		return param;
	}
	return cookies.get('feed') === 'following' ? 'following' : 'all';
}

export const load = (async ({ fetch, depends, url, cookies, parent }) => {
	depends('app:posts');
	const feed = pickFeed(url, cookies, !!(await parent()).user);
	const source = `/api/v1/timeline?feed=${feed}&limit=${PAGE_SIZE}`;
	const [page, pinned, following] = await Promise.all([
		apiGet<Page<Post>>(fetch, source.slice('/api/v1'.length)),
		apiGet<Page<Post>>(fetch, '/timeline/pinned'),
		feed === 'following' ? apiGet<{ items: string[] }>(fetch, '/me/following') : null
	]);
	return {
		feed,
		posts: page.items,
		next: page.next_cursor,
		source,
		pinned: pinned.items,
		following: following?.items ?? null
	};
}) satisfies PageServerLoad;
