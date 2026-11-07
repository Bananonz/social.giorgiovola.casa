import type { PageServerLoad } from './$types';
import { apiGet } from '#lib/apiLoad.js';

export const load = (async ({ fetch }) => {
	const instance = await apiGet<{ registration_open: boolean }>(fetch, '/instance');
	return { registrationOpen: instance.registration_open };
}) satisfies PageServerLoad;
