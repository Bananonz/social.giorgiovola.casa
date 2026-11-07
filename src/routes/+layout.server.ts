import type { LayoutServerLoad } from './$types';
import { apiGet } from '#lib/apiLoad.js';
import { userOf, type Me } from '#lib/me.js';
import type { SwitcherAccount } from '#lib/types.js';

export const load = (async ({ fetch }) => {
	const [me, instance] = await Promise.all([
		// signed out is fine here: every page decides what that means for it
		fetch('/api/v1/me').then((res) => (res.ok ? (res.json() as Promise<Me>) : null)),
		apiGet<{ motd: string }>(fetch, '/instance')
	]);
	const accounts = me
		? (await apiGet<{ items: SwitcherAccount[] }>(fetch, '/auth/accounts')).items
		: [];
	return {
		user: me ? userOf(me) : null,
		role: me?.role ?? 'user',
		muted: me?.muted ?? false,
		muteReason: me?.mute_reason ?? null,
		notisCount: me?.unread.notifications ?? 0,
		messagesCount: me?.unread.messages ?? 0,
		accounts,
		motd: instance.motd
	};
}) satisfies LayoutServerLoad;
