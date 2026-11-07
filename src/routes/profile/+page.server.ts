import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load = (async ({ parent }) => {
	const { user } = await parent();
	if (!user) redirect(307, '/login');
	redirect(307, `/@${user.username}`);
}) satisfies PageServerLoad;
