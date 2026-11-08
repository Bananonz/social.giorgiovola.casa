import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { apiGet } from '#lib/apiLoad.js';
import type { GroupChat, GroupMessage } from '#lib/types.js';

// Nothing is marked as read here: hover preloading runs this load before the page is opened.
export const load = (async ({ fetch, params, depends }) => {
	depends('app:group');
	const id = encodeURIComponent(params.id);
	const [group, thread] = await Promise.all([
		apiGet<GroupChat & { muted: boolean; first_unread_id: number | null }>(fetch, `/groups/${id}`, {
			optional: true
		}),
		apiGet<{ items: GroupMessage[]; next_cursor: string | null }>(fetch, `/groups/${id}/messages`, {
			optional: true
		})
	]);
	// gone, or you were removed from it
	if (!group || !thread) redirect(303, '/messages');
	const { muted, first_unread_id, ...info } = group;
	return {
		group: info,
		thread: { messages: thread.items, hasMore: thread.next_cursor !== null },
		muted,
		firstUnreadId: first_unread_id
	};
}) satisfies PageServerLoad;
