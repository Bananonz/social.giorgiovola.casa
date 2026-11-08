import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
	db,
	dm_mutes,
	group_members,
	group_message_reactions,
	group_messages,
	message_reactions,
	messages,
	users
} from './db/index.js';
import { alias } from 'drizzle-orm/pg-core';
import type { MessageReaction, MessageReplyTo } from '#lib/types.js';
import { hit, isLimited } from './ratelimit.js';

/** Replies and reactions, shared by direct and group messages. */

const REPLY_PREVIEW_LENGTH = 200;
const MAX_EMOJI_LENGTH = 16;
// of the message a reaction is about, in the conversation list
const REACTED_PREVIEW_LENGTH = 60;

// the other side of a direct conversation
const peerUser = alias(users, 'peer');

// reacting, per profile, over direct and group messages together
const REACT_WINDOW_MS = 60_000;
const MAX_REACTIONS = 60;

/** `direct`: messages between two profiles, `group`: messages of a group chat */
export type Thread = 'direct' | 'group';

const tableOf = (thread: Thread) => (thread === 'direct' ? messages : group_messages);
const reactionsTableOf = (thread: Thread) =>
	thread === 'direct' ? message_reactions : group_message_reactions;

/** A single emoji, or null. People can pick any emoji, not only the quick ones the app offers. */
export function parseEmoji(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const emoji = raw.trim();
	if (!emoji || emoji.length > MAX_EMOJI_LENGTH) return null;
	const graphemes = [...new Intl.Segmenter().segment(emoji)];
	if (graphemes.length !== 1) return null;
	return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(emoji) ? emoji : null;
}

/** The 429 to send back when this profile reacts too often, or null. Counts the reaction. */
export function reactionLimited(userId: number): Response | null {
	const key = `react:${userId}`;
	if (isLimited(key, MAX_REACTIONS)) {
		return new Response('You are reacting too fast, try again in a minute', { status: 429 });
	}
	hit(key, REACT_WINDOW_MS);
	return null;
}

/** The reactions to these messages, oldest first, by message id. */
export async function reactionsOf(thread: Thread, ids: number[]) {
	const byMessage = new Map<number, MessageReaction[]>();
	if (ids.length === 0) return byMessage;
	const table = reactionsTableOf(thread);
	const rows = await db
		.select({
			message_id: table.message_id,
			emoji: table.emoji,
			username: users.username,
			name: users.name,
			avatar: users.avatar
		})
		.from(table)
		.innerJoin(users, eq(users.id, table.user_id))
		.where(inArray(table.message_id, ids))
		.orderBy(asc(table.created_at), asc(table.user_id));
	for (const { message_id, ...reaction } of rows) {
		const list = byMessage.get(message_id);
		if (list) list.push(reaction);
		else byMessage.set(message_id, [reaction]);
	}
	return byMessage;
}

/** What replies show of these messages, by id. Deleted ones are missing. */
async function repliedTo(thread: Thread, ids: number[]) {
	const byId = new Map<number, MessageReplyTo>();
	if (ids.length === 0) return byId;
	const table = tableOf(thread);
	const rows = await db
		.select({
			id: table.id,
			username: users.username,
			name: users.name,
			content: sql<string>`LEFT(${table.content}, ${REPLY_PREVIEW_LENGTH})`,
			images: sql<number>`CARDINALITY(${table.images})::int`
		})
		.from(table)
		.innerJoin(users, eq(users.id, table.sender_id))
		.where(inArray(table.id, [...new Set(ids)]));
	for (const { id, username, name, content, images } of rows) {
		byId.set(id, { id, sender: { username, name }, content, images });
	}
	return byId;
}

/** Fills `reply_to` and `reactions` of these messages. */
export async function withRepliesAndReactions<T extends { id: number; reply_to_id: number | null }>(
	thread: Thread,
	found: T[]
): Promise<
	(Omit<T, 'reply_to_id'> & { reply_to: MessageReplyTo | null; reactions: MessageReaction[] })[]
> {
	const [replies, reactions] = await Promise.all([
		repliedTo(
			thread,
			found.flatMap((m) => (m.reply_to_id !== null ? [m.reply_to_id] : []))
		),
		reactionsOf(
			thread,
			found.map((m) => m.id)
		)
	]);
	return found.map(({ reply_to_id, ...m }) => ({
		...m,
		reply_to: reply_to_id !== null ? replies.get(reply_to_id) ?? null : null,
		reactions: reactions.get(m.id) ?? []
	}));
}

/**
 * Sets (or with a null emoji removes) this profile's reaction to a message, and returns the
 * message's reactions after the change, with the id of the message's sender.
 *
 * A reaction is unread for the message's sender until they read the chat. It never moves where
 * the chat reads from: a heart on an old message marks the chat unread, nothing more.
 */
export async function setReaction(
	thread: Thread,
	messageId: number,
	userId: number,
	emoji: string | null
) {
	const table = reactionsTableOf(thread);
	const message = tableOf(thread);
	const [found] = await db
		.select({ sender_id: message.sender_id })
		.from(message)
		.where(eq(message.id, messageId));
	const senderId = found?.sender_id ?? null;
	if (emoji === null) {
		await db.delete(table).where(and(eq(table.message_id, messageId), eq(table.user_id, userId)));
	} else {
		// reacting to your own message leaves nothing to read
		const readAt = senderId === userId ? sql`NOW()` : null;
		// a new emoji replaces the old one and moves to the end, like a fresh reaction, and is
		// unread again; picking the same one again changes nothing
		await db
			.insert(table)
			.values({ message_id: messageId, user_id: userId, emoji, read_at: readAt })
			.onConflictDoUpdate({
				target: [table.message_id, table.user_id],
				set: {
					emoji,
					created_at: sql`CASE WHEN ${table.emoji} = excluded.emoji THEN ${table.created_at} ELSE NOW() END`,
					read_at: sql`CASE WHEN ${table.emoji} = excluded.emoji THEN ${table.read_at} ELSE excluded.read_at END`
				}
			});
	}
	const reactions = (await reactionsOf(thread, [messageId])).get(messageId) ?? [];
	return { reactions, senderId };
}

/** Marks the reactions to what `userId` sent `peerId` as read; returns whether anything changed. */
export async function markDirectReactionsRead(userId: number, peerId: number) {
	const updated = await db
		.update(message_reactions)
		.set({ read_at: sql`NOW()` })
		.where(
			and(
				isNull(message_reactions.read_at),
				inArray(
					message_reactions.message_id,
					db
						.select({ id: messages.id })
						.from(messages)
						.where(and(eq(messages.sender_id, userId), eq(messages.recipient_id, peerId)))
				)
			)
		)
		.returning({ id: message_reactions.message_id });
	return updated.length > 0;
}

/** Marks the reactions to what `userId` sent in this group as read; returns whether anything changed. */
export async function markGroupReactionsRead(groupId: number, userId: number) {
	const updated = await db
		.update(group_message_reactions)
		.set({ read_at: sql`NOW()` })
		.where(
			and(
				isNull(group_message_reactions.read_at),
				inArray(
					group_message_reactions.message_id,
					db
						.select({ id: group_messages.id })
						.from(group_messages)
						.where(and(eq(group_messages.group_id, groupId), eq(group_messages.sender_id, userId)))
				)
			)
		)
		.returning({ id: group_message_reactions.message_id });
	return updated.length > 0;
}

/** Unread reactions to the messages of `userId`, by peer username (direct) and by group id. */
export async function unreadReactionsByChat(userId: number) {
	const [direct, groups] = await Promise.all([
		db
			.select({ peer: peerUser.username, count: sql<number>`COUNT(*)::int` })
			.from(message_reactions)
			.innerJoin(messages, eq(messages.id, message_reactions.message_id))
			.innerJoin(peerUser, eq(peerUser.id, messages.recipient_id))
			.where(and(eq(messages.sender_id, userId), isNull(message_reactions.read_at)))
			.groupBy(peerUser.username),
		db
			.select({ group_id: group_messages.group_id, count: sql<number>`COUNT(*)::int` })
			.from(group_message_reactions)
			.innerJoin(group_messages, eq(group_messages.id, group_message_reactions.message_id))
			// only groups the sender is still in
			.innerJoin(
				group_members,
				and(eq(group_members.group_id, group_messages.group_id), eq(group_members.user_id, userId))
			)
			.where(and(eq(group_messages.sender_id, userId), isNull(group_message_reactions.read_at)))
			.groupBy(group_messages.group_id)
	]);
	return {
		direct: new Map(direct.map((r) => [r.peer, r.count])),
		groups: new Map(groups.map((r) => [r.group_id, r.count]))
	};
}

/** Unread reactions to the messages of `userId`, muted chats aside: part of the messages badge. */
export async function unreadReactionCount(userId: number) {
	const [direct, groups] = await Promise.all([
		db
			.select({ count: sql<number>`COUNT(*)::int` })
			.from(message_reactions)
			.innerJoin(messages, eq(messages.id, message_reactions.message_id))
			.where(
				and(
					eq(messages.sender_id, userId),
					isNull(message_reactions.read_at),
					sql`NOT EXISTS (SELECT 1 FROM ${dm_mutes} WHERE ${dm_mutes.user_id} = ${userId} AND ${dm_mutes.peer_id} = ${messages.recipient_id})`
				)
			),
		db
			.select({ count: sql<number>`COUNT(*)::int` })
			.from(group_message_reactions)
			.innerJoin(group_messages, eq(group_messages.id, group_message_reactions.message_id))
			.innerJoin(
				group_members,
				and(eq(group_members.group_id, group_messages.group_id), eq(group_members.user_id, userId))
			)
			.where(
				and(
					eq(group_messages.sender_id, userId),
					isNull(group_message_reactions.read_at),
					eq(group_members.muted, false)
				)
			)
	]);
	return (direct[0]?.count ?? 0) + (groups[0]?.count ?? 0);
}

/** The latest reaction of a conversation, as the conversation list shows it. */
export type LatestReaction = {
	emoji: string;
	/** the profile that reacted */
	user_id: number;
	name: string;
	/** the message reacted to, clipped */
	content: string;
	images: number;
	created_at: Date;
};

/** The latest reaction of each direct conversation of `userId`, by peer username. */
export async function latestDirectReactions(userId: number) {
	const peer = sql<number>`CASE WHEN ${messages.sender_id} = ${userId} THEN ${messages.recipient_id} ELSE ${messages.sender_id} END`;
	// the pair of participants: DISTINCT ON and ORDER BY must be the same expression, which the
	// CASE above isn't once its parameter is bound twice
	const low = sql`LEAST(${messages.sender_id}, ${messages.recipient_id})`;
	const high = sql`GREATEST(${messages.sender_id}, ${messages.recipient_id})`;
	const rows = await db
		.selectDistinctOn([low, high], {
			peer: peerUser.username,
			emoji: message_reactions.emoji,
			user_id: message_reactions.user_id,
			name: users.name,
			content: sql<string>`LEFT(${messages.content}, ${REACTED_PREVIEW_LENGTH})`,
			images: sql<number>`CARDINALITY(${messages.images})::int`,
			created_at: message_reactions.created_at
		})
		.from(message_reactions)
		.innerJoin(messages, eq(messages.id, message_reactions.message_id))
		.innerJoin(users, eq(users.id, message_reactions.user_id))
		.innerJoin(peerUser, eq(peerUser.id, peer))
		.where(or(eq(messages.sender_id, userId), eq(messages.recipient_id, userId)))
		.orderBy(low, high, desc(message_reactions.created_at));
	return new Map(rows.map(({ peer, ...r }): [string, LatestReaction] => [peer, r]));
}

/**
 * The latest reaction of each of these groups that concerns `userId`, by group id: one they made,
 * or one to their message. Others reacting among themselves don't reshuffle everyone's list.
 */
export async function latestGroupReactions(userId: number, groupIds: number[]) {
	if (groupIds.length === 0) return new Map<number, LatestReaction>();
	const rows = await db
		.selectDistinctOn([group_messages.group_id], {
			group_id: group_messages.group_id,
			emoji: group_message_reactions.emoji,
			user_id: group_message_reactions.user_id,
			name: users.name,
			content: sql<string>`LEFT(${group_messages.content}, ${REACTED_PREVIEW_LENGTH})`,
			images: sql<number>`CARDINALITY(${group_messages.images})::int`,
			created_at: group_message_reactions.created_at
		})
		.from(group_message_reactions)
		.innerJoin(group_messages, eq(group_messages.id, group_message_reactions.message_id))
		.innerJoin(users, eq(users.id, group_message_reactions.user_id))
		.where(
			and(
				inArray(group_messages.group_id, groupIds),
				or(eq(group_message_reactions.user_id, userId), eq(group_messages.sender_id, userId))
			)
		)
		.orderBy(group_messages.group_id, desc(group_message_reactions.created_at));
	return new Map(rows.map(({ group_id, ...r }): [number, LatestReaction] => [group_id, r]));
}

/** The line the conversation list shows for a reaction: `Alice reacted ❤️ to “hi”`. */
export function reactionPreview(reaction: LatestReaction, userId: number) {
	const who = reaction.user_id === userId ? 'You' : reaction.name;
	const clipped = reaction.content.length >= REACTED_PREVIEW_LENGTH ? '…' : '';
	const what = reaction.content
		? `“${reaction.content}${clipped}”`
		: reaction.images > 0
		? 'a photo'
		: 'a message';
	return `${who} reacted ${reaction.emoji} to ${what}`;
}

/** The two participants of a direct message, if `userId` is one of them. */
export async function directMessageParties(messageId: number, userId: number) {
	const [row] = await db
		.select({ sender_id: messages.sender_id, recipient_id: messages.recipient_id })
		.from(messages)
		.where(
			and(
				eq(messages.id, messageId),
				or(eq(messages.sender_id, userId), eq(messages.recipient_id, userId))
			)
		);
	return row ?? null;
}

/** Whether `messageId` is a message (not an event) of this group: what replies and reactions accept. */
export async function isGroupMessage(groupId: number, messageId: number) {
	return (
		(await db.$count(
			group_messages,
			and(
				eq(group_messages.id, messageId),
				eq(group_messages.group_id, groupId),
				eq(group_messages.kind, 'message')
			)
		)) > 0
	);
}

/** Whether `messageId` is a message between these two profiles. */
export async function isDirectMessageBetween(messageId: number, a: number, b: number) {
	return (
		(await db.$count(
			messages,
			and(
				eq(messages.id, messageId),
				or(
					and(eq(messages.sender_id, a), eq(messages.recipient_id, b)),
					and(eq(messages.sender_id, b), eq(messages.recipient_id, a))
				)
			)
		)) > 0
	);
}
