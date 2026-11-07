import type { LayoutServerLoad } from './$types';
import { apiGet } from '#lib/apiLoad.js';
import { userOf, type Me } from '#lib/me.js';
import type { SwitcherAccount } from '#lib/types.js';

export const load = (async ({ fetch }) => {
	// signed out is fine for /me and /auth/accounts: every page decides what that means for it
	const [me, accounts, instance] = await Promise.all([
		fetch('/api/v1/me').then((res) => (res.ok ? (res.json() as Promise<Me>) : null)),
		fetch('/api/v1/auth/accounts').then(async (res) =>
			res.ok ? ((await res.json()) as { items: SwitcherAccount[] }).items : []
		),
		apiGet<{ motd: string }>(fetch, '/instance')
	]);
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
