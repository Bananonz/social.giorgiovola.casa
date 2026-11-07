import type { PageServerLoad } from './$types';
import type { Page } from '#lib/api.js';
import { apiGet } from '#lib/apiLoad.js';
import type { Post } from '#lib/types.js';

const PAGE_SIZE = 10;

export const load = (async ({ params, fetch, depends }) => {
	depends('app:posts');
	const info = await apiGet<{ tag: string; posts: number }>(
		fetch,
		`/hashtags/${encodeURIComponent(params.tag)}`,
		{ login: false }
	);
	const source = `/api/v1/hashtags/${encodeURIComponent(info.tag)}/posts?limit=${PAGE_SIZE}`;
	const page = await apiGet<Page<Post>>(fetch, source.slice('/api/v1'.length), { login: false });
	return { tag: info.tag, count: info.posts, posts: page.items, next: page.next_cursor, source };
}) satisfies PageServerLoad;
