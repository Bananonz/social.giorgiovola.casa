import type { PageServerLoad } from './$types';
import { isHttpError, type Cookies } from '@sveltejs/kit';
import type { Page } from '#lib/api.js';
import { apiGet } from '#lib/apiLoad.js';
import type { Post } from '#lib/types.js';

type Feed = 'all' | 'following';

const PAGE_SIZE = 10;

// the chosen feed is remembered in a cookie (a UI preference), so the home page opens on it next time
function pickFeed(url: URL, cookies: Cookies): Feed {
	const param = url.searchParams.get('feed');
	if (param === 'all' || param === 'following') {
		if (cookies.get('feed') !== param)
			cookies.set('feed', param, { path: '/', maxAge: 60 * 60 * 24 * 365, httpOnly: true });
		return param;
	}
	return cookies.get('feed') === 'following' ? 'following' : 'all';
}

const timeline = (fetch: typeof globalThis.fetch, feed: Feed) =>
	apiGet<Page<Post>>(fetch, `/timeline?feed=${feed}&limit=${PAGE_SIZE}`, { login: false });

const signedOut = (e: unknown) => {
	if (isHttpError(e, 401)) return null;
	throw e;
};

export const load = (async ({ fetch, depends, url, cookies }) => {
	depends('app:posts');
	// no await parent(): the layout's calls run alongside these instead of before them
	let feed = pickFeed(url, cookies);
	const [timelinePage, pinned, following] = await Promise.all([
		// signed out, the following feed is a 401: show everything instead
		timeline(fetch, feed).catch(signedOut),
		apiGet<Page<Post>>(fetch, '/timeline/pinned'),
		feed === 'following'
			? apiGet<{ items: string[] }>(fetch, '/me/following', { login: false }).catch(signedOut)
			: null
	]);
	let page = timelinePage;
	if (!page) {
		feed = 'all';
		page = await timeline(fetch, feed);
	}
	return {
		feed,
		posts: page.items,
		next: page.next_cursor,
		source: `/api/v1/timeline?feed=${feed}&limit=${PAGE_SIZE}`,
		pinned: pinned.items,
		following: feed === 'following' ? following?.items ?? null : null
	};
}) satisfies PageServerLoad;
