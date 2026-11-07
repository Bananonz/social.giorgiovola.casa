import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { apiGet } from '#lib/apiLoad.js';
import type { GroupChat } from '#lib/types.js';

export const load = (async ({ fetch, params, depends }) => {
	depends('app:group');
	const group = await apiGet<GroupChat & { muted: boolean }>(
		fetch,
		`/groups/${encodeURIComponent(params.id)}`,
		{ optional: true }
	);
	if (!group) redirect(303, '/messages');
	const { muted: _, ...info } = group;
	return { group: info };
}) satisfies PageServerLoad;
