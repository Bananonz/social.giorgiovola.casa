import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Page } from '#lib/api.js';
import { apiGet } from '#lib/apiLoad.js';

const PAGE_SIZE = 25;
const FILTERS = ['all', 'banned', 'muted', 'staff'] as const;

type Account = {
	username: string;
	name: string;
	avatar: string | null;
	role: 'user' | 'mod' | 'admin';
	banned_at: string | null;
	ban_reason: string | null;
	muted_at: string | null;
	mute_reason: string | null;
	created_at: string;
	identities: {
		username: string;
		name: string;
		avatar: string | null;
		bot: boolean;
		members: string[];
	}[];
	shared_with: { username: string; name: string; avatar: string | null; owner_username: string }[];
	self: boolean;
	can_moderate: boolean;
	can_manage: boolean;
};

export const load = (async ({ fetch, url, parent }) => {
	const { user, role } = await parent();
	if (!user) redirect(303, '/login');
	// staff only, and nothing to tell everyone else
	if (role === 'user') error(404, 'Not found');

	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 64);
	const rawFilter = url.searchParams.get('filter');
	const filter = FILTERS.find((f) => f === rawFilter) ?? 'all';
	const rawPage = url.searchParams.get('page') ?? '0';
	const page = /^\d{1,4}$/.test(rawPage) ? Number(rawPage) : 0;

	const params = new URLSearchParams({ q, filter, limit: String(PAGE_SIZE) });
	if (page > 0) params.set('cursor', String(page * PAGE_SIZE));
	const [accounts, motd] = await Promise.all([
		apiGet<Page<Account>>(fetch, `/admin/users?${params}`),
		// only admins change it, the default is shown as an empty field
		role === 'admin'
			? apiGet<{ motd: string; custom: boolean; default: string; max: number }>(
					fetch,
					'/admin/motd'
			  )
			: null
	]);
	return {
		role,
		motd: motd ? (motd.custom ? motd.motd : '') : null,
		defaultMotd: motd?.default ?? '',
		maxMotd: motd?.max ?? 100,
		q,
		filter,
		page,
		hasMore: accounts.next_cursor !== null,
		users: accounts.items
	};
}) satisfies PageServerLoad;
