import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { apiGet } from '#lib/apiLoad.js';
import type { ChatMessage, ChatPeer } from '#lib/types.js';

// Nothing is marked as read here: hover preloading runs this load before the page is opened.
export const load = (async ({ fetch, params, parent }) => {
	const { user } = await parent();
	if (!user) redirect(303, '/login');
	const username = encodeURIComponent(params.username.toLowerCase());
	if (params.username.toLowerCase() === user.username) redirect(303, '/messages');
	const [conversation, thread] = await Promise.all([
		apiGet<{
			peer: ChatPeer;
			block: { me: boolean; peer: boolean };
			muted: boolean;
			first_unread_id: number | null;
		}>(fetch, `/conversations/${username}`),
		apiGet<{ items: ChatMessage[]; next_cursor: string | null }>(
			fetch,
			`/conversations/${username}/messages`
		)
	]);
	return {
		...conversation,
		thread: { messages: thread.items, hasMore: thread.next_cursor !== null }
	};
}) satisfies PageServerLoad;
