import type { PageServerLoad } from './$types';
import type { Page } from '#lib/api.js';
import { apiGet } from '#lib/apiLoad.js';
import type { Notification } from '#lib/types.js';

const PAGE_SIZE = 50;

export const load = (async ({ fetch }) => {
	const source = `/api/v1/notifications?limit=${PAGE_SIZE}`;
	const page = await apiGet<Page<Notification>>(fetch, source.slice('/api/v1'.length));
	return { notifications: page.items, next: page.next_cursor, source };
}) satisfies PageServerLoad;
