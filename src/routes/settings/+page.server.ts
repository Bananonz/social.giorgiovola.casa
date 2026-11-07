import type { PageServerLoad } from './$types';
import { apiGet } from '#lib/apiLoad.js';
import type { Me } from '#lib/me.js';

type Bot = {
	id: number;
	name: string;
	username: string;
	avatar: string | null;
	bio: string;
	website: string;
	created_at: string;
	last_used_at: string | null;
};
type Passkey = {
	id: string;
	name: string;
	backed_up: boolean;
	created_at: string;
	last_used_at: string | null;
};
type Session = {
	id: number;
	kind: 'cookie' | 'token' | 'personal';
	name: string | null;
	user_agent: string | null;
	created_at: string;
	expires_at: string | null;
	last_used_at: string | null;
	current: boolean;
};

export const load = (async ({ fetch }) => {
	const [me, bots, passkeys, sessions] = await Promise.all([
		apiGet<Me>(fetch, '/me'),
		apiGet<{ items: Bot[]; max: number }>(fetch, '/me/bots'),
		apiGet<{ items: Passkey[]; max: number; rp_id: string; user_handle: string }>(
			fetch,
			'/me/passkeys'
		),
		apiGet<{ items: Session[] }>(fetch, '/auth/sessions')
	]);
	return {
		account: me.account?.username ?? me.user.username,
		bots: bots.items,
		maxBots: bots.max,
		passkeys: passkeys.items,
		maxPasskeys: passkeys.max,
		// lets the page tell the browser which passkeys are still valid, so deleted ones disappear
		rpID: passkeys.rp_id,
		userHandle: passkeys.user_handle,
		sessions: sessions.items
	};
}) satisfies PageServerLoad;
