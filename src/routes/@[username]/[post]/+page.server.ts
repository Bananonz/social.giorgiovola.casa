import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { allPages, type Page } from '#lib/api.js';
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
					? allPages((cursor) =>
							apiGet<Page<Post>>(
								fetch,
								`/posts/${post.id}/replies?limit=${MAX_REPLIES}${
									cursor ? `&cursor=${cursor}` : ''
								}`,
								{ login: false }
							)
					  )
					: Promise.resolve([] as Post[])
		}
	};
}) satisfies PageServerLoad;
