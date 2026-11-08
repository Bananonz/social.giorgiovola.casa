import type { LayoutServerLoad } from './$types';
import { apiGet } from '#lib/apiLoad.js';
import type { Conversation, GroupConversation } from '#lib/types.js';

// the list is shown on its own page and beside an open chat, not on the other pages here
const withList = ['/messages', '/messages/[username]', '/messages/groups/[id]'];

export const load = (async ({ fetch, depends, route }) => {
	depends('app:messages');
	if (!withList.includes(route.id)) return { conversations: null, groups: null };
	const { direct, groups } = await apiGet<{
		direct: (Conversation & { muted: boolean })[];
		groups: GroupConversation[];
	}>(fetch, '/conversations');
	// direct conversations carry `muted`
	return { conversations: direct, groups };
}) satisfies LayoutServerLoad;
