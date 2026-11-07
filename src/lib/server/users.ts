import { eq } from 'drizzle-orm';
import { db, users } from './db/index.js';
import { getProfileCard } from './follows.js';
import { getBlock } from './messages.js';
import { canModerate, findTarget, isStaff } from './moderation.js';

/**
 * A profile as its page shows it: the hover card fields, when it was created, its pinned post,
 * whether either side blocked the other and, for staff allowed to act on it, its moderation
 * state. Null when the username doesn't exist.
 */
export async function getProfile(username: string, locals: App.Locals) {
	const card = await getProfileCard(username, locals.user?.id);
	if (!card) return null;
	const [row] = await db
		.select({ id: users.id, created_at: users.created_at, pinned: users.pinned_post_id })
		.from(users)
		.where(eq(users.username, card.username));

	const viewer = locals.user;
	const block =
		viewer && !card.self ? await getBlock(viewer.id, row.id) : { me: false, peer: false };

	// staff see the moderation controls on profiles they are allowed to act on
	let moderation: {
		banned: boolean;
		muted: boolean;
		ban_reason: string | null;
		mute_reason: string | null;
		/** the profile is an identity (or bot): moderation acts on the account behind it */
		identity: boolean;
	} | null = null;
	if (isStaff(locals.role) && locals.auth !== 'bot') {
		const target = await findTarget(card.username);
		if (target && canModerate(locals, target))
			moderation = {
				banned: target.banned_at !== null,
				muted: target.muted_at !== null,
				ban_reason: target.ban_reason,
				mute_reason: target.mute_reason,
				identity: target.username !== card.username
			};
	}

	return {
		...card,
		created_at: row.created_at,
		pinned_post_id: row.pinned,
		blocked: block.me,
		blocks_you: block.peer,
		moderation
	};
}

/** The id of a profile by username, null when there is none. */
export async function profileId(username: string) {
	const [row] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
	return row?.id ?? null;
}
