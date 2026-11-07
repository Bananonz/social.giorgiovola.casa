import type { User } from './types.js';

/** GET /api/v1/me */
export type Me = {
	user: {
		id: number;
		username: string;
		name: string;
		avatar: string | null;
		bio: string;
		website: string;
		email: string | null;
		bot: boolean;
		identity: boolean;
		created_at: string;
	};
	account: { id: number; username: string } | null;
	role: 'user' | 'mod' | 'admin';
	muted: boolean;
	mute_reason: string | null;
	unread: { notifications: number; messages: number };
	auth: 'cookie' | 'token' | 'bot';
};

/** The `user` the components know (the profile in use), from GET /api/v1/me. */
export const userOf = (me: Me): User => ({
	id: me.user.id,
	email: me.user.email,
	name: me.user.name,
	username: me.user.username,
	avatar: me.user.avatar,
	bot: me.user.bot,
	created_at: new Date(me.user.created_at),
	owner_id: me.user.identity ? me.account?.id ?? null : null
});
