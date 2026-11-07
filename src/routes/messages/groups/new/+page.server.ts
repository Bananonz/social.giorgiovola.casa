import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load = (async ({ parent }) => {
	if (!(await parent()).user) redirect(303, '/login');
}) satisfies PageServerLoad;
