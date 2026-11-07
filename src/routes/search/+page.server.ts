import type { PageServerLoad } from './$types';
import { apiGet } from '#lib/apiLoad.js';
import type { HashtagResult, UserResult } from '#lib/types.js';

const MAX_RESULTS = 20;

export const load = (async ({ fetch, url }) => {
	const q = url.searchParams.get('q') ?? '';
	// signed in only, like the API: anonymous visitors go to the login page
	return apiGet<{ query: string; users: UserResult[]; hashtags: HashtagResult[] }>(
		fetch,
		`/search?q=${encodeURIComponent(q)}&limit=${MAX_RESULTS}`
	);
}) satisfies PageServerLoad;
