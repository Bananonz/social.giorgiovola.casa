import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Page } from '#lib/api.js';
import { apiGet } from '#lib/apiLoad.js';
import type { Post } from '#lib/types.js';

const MAX_REPLIES = 200;

export const load = (async ({ params, fetch }) => {
	if (!/^\d{1,10}$/.test(params.post)) error(404, 'Post not found');
	const post = await apiGet<Post>(fetch, `/posts/${params.post}`, { login: false });
	// the URL names the author: another username is another post
	if (post.user.username !== params.username.toLowerCase()) error(404, 'Post not found');

	return {
		post,
		streamed: {
			replies:
				post.replies_count > 0
					? apiGet<Page<Post>>(fetch, `/posts/${post.id}/replies?limit=${MAX_REPLIES}`, {
							login: false
					  }).then((page) => page.items)
					: Promise.resolve([] as Post[])
		}
	};
}) satisfies PageServerLoad;
