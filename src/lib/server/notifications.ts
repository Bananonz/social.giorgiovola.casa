import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Notification } from '#lib/types.js';
import { db, inbox } from './db/index.js';
import { unreadMessageCount } from './messages.js';
import { unreadReactionCount } from './messageReactions.js';
import { pushUnread } from './realtime.js';

/** A profile's notifications, newest first (`limit + 1` rows, see offsetPage). */
export async function listNotifications(userId: number, limit: number, offset: number) {
	const rows = await db
		.select({
			id: inbox.id,
			// correlated subqueries: the table names are written out so they can't be mis-qualified
			sender: sql<Notification['sender']>`(
				SELECT jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'avatar', u.avatar)
				FROM users u WHERE u.id = inbox.sender_id
			)`,
			user_id: inbox.user_id,
			post: sql<Notification['post']>`(
				SELECT jsonb_build_object('content', p.content, 'id', p.id)
				FROM posts p WHERE p.id = inbox.post_id
			)`,
			type: inbox.type,
			created_at: inbox.created_at,
			read_at: inbox.read_at
		})
		.from(inbox)
		.where(eq(inbox.user_id, userId))
		.orderBy(desc(inbox.created_at), desc(inbox.id))
		.limit(limit + 1)
		.offset(offset);
	return rows as Notification[];
}

/** Unread notifications, messages and reactions to your messages (muted chats left out). */
export async function unreadCounts(userId: number) {
	const [notifications, messages, reactions] = await Promise.all([
		db.$count(inbox, and(eq(inbox.user_id, userId), isNull(inbox.read_at))),
		unreadMessageCount(userId),
		unreadReactionCount(userId)
	]);
	return { notifications, messages, reactions };
}

/** Marks one notification read. False when it isn't one of the profile's. */
export async function markNotificationRead(userId: number, id: number) {
	const updated = await db
		.update(inbox)
		.set({ read_at: sql`COALESCE(${inbox.read_at}, NOW())` })
		.where(and(eq(inbox.id, id), eq(inbox.user_id, userId)))
		.returning({ id: inbox.id });
	void pushUnread([userId]);
	return updated.length > 0;
}

export async function markAllNotificationsRead(userId: number) {
	await db
		.update(inbox)
		.set({ read_at: sql`NOW()` })
		.where(and(eq(inbox.user_id, userId), isNull(inbox.read_at)));
	void pushUnread([userId]);
}

/** The post was on the viewer's screen: their mention notification for it is now read. */
export async function markPostSeen(userId: number, postId: number) {
	const updated = await db
		.update(inbox)
		.set({ read_at: sql`NOW()` })
		.where(
			and(
				eq(inbox.user_id, userId),
				eq(inbox.post_id, postId),
				eq(inbox.type, 'mention'),
				isNull(inbox.read_at)
			)
		)
		.returning({ id: inbox.id });
	if (updated.length > 0) void pushUnread([userId]);
}
