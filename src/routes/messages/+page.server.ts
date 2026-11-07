import type { PageServerLoad } from './$types';
import { apiGet } from '#lib/apiLoad.js';
import type { Conversation, GroupConversation } from '#lib/types.js';

export const load = (async ({ fetch, depends }) => {
	depends('app:messages');
	const { direct, groups } = await apiGet<{
		direct: (Conversation & { muted: boolean })[];
		groups: GroupConversation[];
	}>(fetch, '/conversations');
	// direct conversations carry `muted`
	return { conversations: direct, groups };
}) satisfies PageServerLoad;
