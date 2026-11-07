import type { PageServerLoad } from './$types';
import { apiGet } from '#lib/apiLoad.js';
import type { User } from '#lib/types.js';

type Member = Pick<User, 'name' | 'username' | 'avatar'>;

export const load = (async ({ fetch }) => {
	const identities = await apiGet<{
		max_identities: number;
		max_members: number;
		owned: (Member & { members: Member[] })[];
	}>(fetch, '/me/identities');
	return {
		maxIdentities: identities.max_identities,
		maxMembers: identities.max_members,
		owned: identities.owned
	};
}) satisfies PageServerLoad;
