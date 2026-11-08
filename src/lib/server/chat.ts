import type { ShareRecipient, User } from '#lib/types.js';
import { fail, rateLimit } from './api.js';
import {
	addMembers,
	createGroup,
	createLimited,
	deleteGroupMessage,
	editGroupMessage,
	getGroup,
	getGroupConversations,
	getGroupThread,
	isGroupMuted,
	manageLimited,
	markGroupRead,
	parseGroupName,
	parseUsernames,
	removeMember,
	renameGroup,
	resolveNewMembers,
	sendGroupMessage,
	setGroupMuted,
	toGroupChat,
	type GroupState
} from './groups.js';
import { removeUploads } from './images.js';
import {
	checkMessage,
	countMessage,
	hasImages,
	messageLimited,
	readMessageBody,
	readReplyTo,
	saveMessageImages
} from './messageInput.js';
import {
	isDirectMessageBetween,
	isGroupMessage,
	parseEmoji,
	reactionLimited,
	setReaction
} from './messageReactions.js';
import {
	deleteMessage,
	editMessage,
	findPeer,
	getBlock,
	getConversations,
	getThread,
	isDmMuted,
	markThreadRead,
	mutedPeers,
	sendMessage,
	setDmMuted
} from './messages.js';
import {
	publishGroupMessage,
	publishGroupMessageDeleted,
	publishGroupMessageEdited,
	publishGroupMessageReactions,
	publishGroupUpdated,
	publishMessage,
	publishMessageDeleted,
	publishMessageEdited,
	publishMessageReactions,
	publishTyping,
	pushUnreadMessages
} from './realtime.js';
import { LIMITS } from './validation.js';
import { EDIT_WINDOW_MS } from '#lib/messageEdits.js';

/** Direct conversations and group chats, as the /api/v1 endpoints use them. */

const thrown = <T>(value: T | Response | null): T => {
	if (value instanceof Response) throw value;
	return value as T;
};

/** A page of a thread for the API: oldest first; `next_cursor` continues with older messages. */
const threadPage = <M extends { id: number }>({
	hasMore,
	messages
}: {
	hasMore: boolean;
	messages: M[];
}) => ({
	items: messages,
	next_cursor: hasMore && messages.length ? String(messages[0].id) : null
});

// ---------------------------------------------------------------------------------------------
// direct conversations

/** Every conversation of the profile: direct ones (with `muted`) and groups, latest first. */
export async function listConversations(userId: number) {
	const [direct, groups, muted] = await Promise.all([
		getConversations(userId),
		getGroupConversations(userId),
		mutedPeers(userId)
	]);
	const mutedSet = new Set(muted);
	return {
		direct: direct.map((c) => ({ ...c, muted: mutedSet.has(c.peer.username) })),
		groups
	};
}

// conversations offered first when sharing a post by message
const RECENT = 8;

/**
 * Where a post can be shared: `recent` holds the latest direct and group conversations, newest
 * first, `groups` every group the profile is in.
 */
export async function shareTargets(userId: number) {
	const [conversations, groupConversations] = await Promise.all([
		getConversations(userId),
		getGroupConversations(userId)
	]);
	const dated = [
		...conversations.map((c) => ({
			at: new Date(c.created_at).getTime(),
			to: { kind: 'user', peer: c.peer } satisfies ShareRecipient
		})),
		...groupConversations.map((g) => ({
			at: new Date(g.created_at).getTime(),
			to: { kind: 'group', group: g.group } satisfies ShareRecipient
		}))
	].sort((a, b) => b.at - a.at);
	return {
		recent: dated.slice(0, RECENT).map((d) => d.to),
		groups: groupConversations.map((g) => ({ kind: 'group' as const, group: g.group }))
	};
}

/** The other side of a conversation, or a 404. You can't talk to yourself. */
async function peerOf(me: User, username: string) {
	const peer = (await findPeer(username)) ?? fail(404, 'User not found');
	if (peer.id === me.id) fail(400, "You can't message yourself");
	return peer;
}

/** A direct conversation: who it is with, blocks either way and whether you muted it. */
export async function getConversation(me: User, username: string) {
	const peer = await peerOf(me, username);
	const [block, muted] = await Promise.all([getBlock(me.id, peer.id), isDmMuted(me.id, peer.id)]);
	return {
		peer: { username: peer.username, name: peer.name, avatar: peer.avatar },
		// `me`: you blocked them, `peer`: they blocked you
		block,
		muted
	};
}

/** A page of a direct conversation, oldest first: the latest messages, or the ones before `before`. */
export async function conversationMessages(me: User, username: string, before: number | null) {
	const peer = (await findPeer(username)) ?? fail(404, 'User not found');
	return threadPage(await getThread(me, peer, before));
}

// the bot API's message limit and bucket (see botLimited), so bots can't get more by using v1
const MAX_BOT_MESSAGES = 70;

/**
 * Reads a message body. Bots send text only, like in the bot API, and count against its
 * message limit (before the body is read).
 */
async function readMessage(locals: App.Locals, me: User, request: Request) {
	const bot = locals.auth === 'bot';
	if (bot) {
		if (request.headers.get('content-type')?.startsWith('multipart/form-data'))
			fail(403, "Bots can't attach images, send JSON");
		rateLimit(`bot:${me.id}:messages`, MAX_BOT_MESSAGES, 60_000, 'Messaging too fast');
	}
	const body = thrown(await readMessageBody(request));
	if (bot && hasImages(body)) fail(403, "Bots can't attach images");
	return body;
}

/** Sends a direct message: JSON `{ content, uploads?, reply_to? }` or multipart with `images`. */
export async function sendDirect(locals: App.Locals, me: User, username: string, request: Request) {
	const body = await readMessage(locals, me, request);
	const withImages = hasImages(body);
	thrown(messageLimited(me.id, withImages));
	thrown(checkMessage(body, me.id));
	const replyTo = thrown(readReplyTo(body.fields));

	const peer = await peerOf(me, username);
	const block = await getBlock(me.id, peer.id);
	if (block.me) fail(403, 'Unblock this user to message them');
	if (block.peer) fail(403, "You can't message this user");
	if (replyTo !== null && !(await isDirectMessageBetween(replyTo, me.id, peer.id)))
		fail(400, 'The message you are replying to is gone');

	countMessage(me.id, withImages);
	const images = thrown(await saveMessageImages(body, me.id));
	let message;
	try {
		message = await sendMessage(me, peer, body.content, images, replyTo);
	} catch (e) {
		await removeUploads(images);
		throw e;
	}
	void publishMessage(message, me.id, peer.id, me.name);
	return message;
}

// edits, per profile over direct and group messages together
const MAX_EDITS = 30;

/** The new text of an edited message: `{ content }`, trimmed and within the limit. */
function readEdit(body: Record<string, unknown>) {
	if (typeof body.content !== 'string') fail(400, 'content must be a string');
	const content = body.content.trim();
	if (content.length > LIMITS.messageContent)
		fail(400, `Messages can be at most ${LIMITS.messageContent} characters`);
	return content;
}

/** Turns what an edit service said went wrong into the error to send back. */
function edited<M>(result: M | 'gone' | 'expired' | 'empty'): M {
	// someone else's message and a missing one look the same, like for deleting
	if (result === 'gone') fail(404, 'Message not found');
	if (result === 'expired')
		fail(403, `Messages can only be edited for ${EDIT_WINDOW_MS / 60_000} minutes after sending`);
	if (result === 'empty') fail(400, 'Missing content');
	return result as M;
}

/** Changes the text of one of your own messages to `username`, within an hour of sending it. */
export async function editDirect(
	me: User,
	username: string,
	id: number,
	body: Record<string, unknown>
) {
	const content = readEdit(body);
	const peer = (await findPeer(username)) ?? fail(404, 'User not found');
	const block = await getBlock(me.id, peer.id);
	if (block.me || block.peer) fail(403, "You can't edit messages in this conversation");
	rateLimit(`message-edit:${me.id}`, MAX_EDITS, 60_000, 'Editing too fast');
	const message = edited(await editMessage(me, peer, id, content));
	publishMessageEdited(message, [me.id, peer.id]);
	return message;
}

/** Deletes one of your own messages of the conversation with `username`, for both sides. */
export async function deleteDirect(me: User, username: string, id: number) {
	const peer = (await findPeer(username)) ?? fail(404, 'User not found');
	const deleted = await deleteMessage(me.id, id, peer.id);
	// someone else's message and a missing one look the same: ids of others' messages stay private
	if (!deleted) fail(404, 'Message not found');
	await removeUploads(deleted.images);
	void publishMessageDeleted(id, me.id, deleted.recipient_id);
}

/** Sets (`emoji`) or removes (null) your reaction to a message of the conversation. */
export async function reactDirect(me: User, username: string, id: number, rawEmoji: unknown) {
	const emoji = rawEmoji === null ? null : parseEmoji(rawEmoji);
	if (rawEmoji !== null && emoji === null) fail(400, 'emoji must be a single emoji');
	const peer = (await findPeer(username)) ?? fail(404, 'User not found');
	if (!(await isDirectMessageBetween(id, me.id, peer.id))) fail(404, 'Message not found');
	const block = await getBlock(me.id, peer.id);
	if (block.me || block.peer) fail(403, "You can't react in this conversation");
	thrown(reactionLimited(me.id));
	const reactions = await setReaction('direct', id, me.id, emoji);
	publishMessageReactions(id, reactions, [me.id, peer.id]);
	return { reactions };
}

export async function readDirect(me: User, username: string) {
	const peer = (await findPeer(username)) ?? fail(404, 'User not found');
	if (await markThreadRead(me.id, peer.id)) void pushUnreadMessages(me.id);
}

export async function muteDirect(me: User, username: string, muted: boolean) {
	const peer = await peerOf(me, username);
	await setDmMuted(me.id, peer.id, muted);
	// its unread messages leave or join the badge
	void pushUnreadMessages(me.id);
	return { muted };
}

// the composer sends one every few seconds while someone is writing
const MAX_TYPING = 40;

/** Tells the other side you are writing. Nothing is stored. Silent for muted accounts. */
export async function typingDirect(locals: App.Locals, me: User, username: string) {
	if (locals.muted) return;
	rateLimit(`typing:${me.id}`, MAX_TYPING);
	const peer = (await findPeer(username)) ?? fail(404, 'User not found');
	const block = await getBlock(me.id, peer.id);
	// blocked either way: they can't get your messages, so they don't see you writing either
	if (!block.me && !block.peer) publishTyping(me, [peer.id], null);
}

// ---------------------------------------------------------------------------------------------
// groups

/** A group you are in, or a 404: a missing group and one you aren't in look the same. */
export async function groupOf(me: Pick<User, 'id'>, id: number | null): Promise<GroupState> {
	const group = id === null ? null : await getGroup(id, me.id);
	return group ?? fail(404, 'Group not found');
}

/** A group's name, owner and members, and whether you muted it. */
export async function getGroupInfo(me: User, id: number | null) {
	const group = await groupOf(me, id);
	return { ...toGroupChat(group), muted: await isGroupMuted(group.id, me.id) };
}

/** Creates a group chat: `{ name, members: [username, …] }`; you become its owner. */
export async function newGroup(me: User, body: Record<string, unknown>) {
	const parsed = parseGroupName(body.name);
	if ('error' in parsed) fail(400, parsed.error);
	const usernames = parseUsernames(body.members);
	if (!usernames) fail(400, 'members must be a list of usernames');
	thrown(createLimited(me.id));
	const others = thrown(await resolveNewMembers(me.id, usernames));
	if (others.length === 0) fail(400, 'Add at least one other person');
	if (others.length + 1 > LIMITS.groupMembers)
		fail(400, `Groups can have at most ${LIMITS.groupMembers} members`);
	const { id, events } = await createGroup(me.id, parsed.name, others);
	// the new group shows up in everyone's conversation list
	void publishGroupUpdated(id, [me.id, ...others], events);
	return getGroupInfo(me, id);
}

/** Renames the group: `{ name }`. Any member can. */
export async function renameGroupAs(me: User, id: number | null, rawName: unknown) {
	const group = await groupOf(me, id);
	const parsed = parseGroupName(rawName);
	if ('error' in parsed) fail(400, parsed.error);
	thrown(manageLimited(me.id));
	// nothing to say when it is the same name
	if (parsed.name !== group.name) {
		const events = await renameGroup(group.id, me.id, parsed.name);
		void publishGroupUpdated(
			group.id,
			group.members.map((m) => m.id),
			events
		);
	}
	return getGroupInfo(me, group.id);
}

export async function groupMessages(me: User, id: number | null, before: number | null) {
	const group = await groupOf(me, id);
	return threadPage(await getGroupThread(group.id, before));
}

/** Sends a message to the group: JSON `{ content, uploads?, reply_to? }` or multipart. */
export async function sendToGroup(
	locals: App.Locals,
	me: User,
	id: number | null,
	request: Request
) {
	const body = await readMessage(locals, me, request);
	const withImages = hasImages(body);
	thrown(messageLimited(me.id, withImages));
	thrown(checkMessage(body, me.id));
	const replyTo = thrown(readReplyTo(body.fields));
	const group = await groupOf(me, id);
	if (replyTo !== null && !(await isGroupMessage(group.id, replyTo)))
		fail(400, 'The message you are replying to is gone');

	countMessage(me.id, withImages);
	const images = thrown(await saveMessageImages(body, me.id));
	let message;
	try {
		message = await sendGroupMessage(group.id, me, body.content, images, replyTo);
	} catch (e) {
		await removeUploads(images);
		throw e;
	}
	void publishGroupMessage(
		message,
		me.id,
		group.members.map((m) => m.id),
		group.name
	);
	return message;
}

/** Changes the text of one of your own messages in the group, within an hour of sending it. */
export async function editInGroup(
	me: User,
	id: number | null,
	messageId: number,
	body: Record<string, unknown>
) {
	const content = readEdit(body);
	const group = await groupOf(me, id);
	rateLimit(`message-edit:${me.id}`, MAX_EDITS, 60_000, 'Editing too fast');
	const message = edited(await editGroupMessage(group.id, me.id, messageId, content));
	publishGroupMessageEdited(
		message,
		group.members.map((m) => m.id)
	);
	return message;
}

/** Deletes one of your own messages in the group. */
export async function deleteFromGroup(me: User, id: number | null, messageId: number) {
	const group = await groupOf(me, id);
	const deleted = await deleteGroupMessage(group.id, me.id, messageId);
	if (!deleted) fail(404, 'Message not found');
	await removeUploads(deleted.images);
	void publishGroupMessageDeleted(
		group.id,
		messageId,
		group.members.map((m) => m.id)
	);
}

/** Sets (`emoji`) or removes (null) your reaction to a group message. */
export async function reactInGroup(
	me: User,
	id: number | null,
	messageId: number,
	rawEmoji: unknown
) {
	const emoji = rawEmoji === null ? null : parseEmoji(rawEmoji);
	if (rawEmoji !== null && emoji === null) fail(400, 'emoji must be a single emoji');
	const group = await groupOf(me, id);
	// events (someone joined, left…) take no reactions
	if (!(await isGroupMessage(group.id, messageId))) fail(404, 'Message not found');
	thrown(reactionLimited(me.id));
	const reactions = await setReaction('group', messageId, me.id, emoji);
	publishGroupMessageReactions(
		group.id,
		messageId,
		reactions,
		group.members.map((m) => m.id)
	);
	return { reactions };
}

export async function readGroup(me: User, id: number | null) {
	const group = await groupOf(me, id);
	if (await markGroupRead(group.id, me.id)) void pushUnreadMessages(me.id);
}

export async function muteGroup(me: User, id: number | null, muted: boolean) {
	const group = await groupOf(me, id);
	await setGroupMuted(group.id, me.id, muted);
	void pushUnreadMessages(me.id);
	return { muted };
}

/** Adds people to the group: `{ usernames: [username, …] }`. Any member can. */
export async function addToGroup(me: User, id: number | null, rawUsernames: unknown) {
	const group = await groupOf(me, id);
	const usernames = parseUsernames(rawUsernames);
	if (!usernames || usernames.length === 0) fail(400, 'usernames must be a list of usernames');
	thrown(manageLimited(me.id));
	const ids = thrown(await resolveNewMembers(me.id, usernames));
	const result = await addMembers(group.id, me.id, ids);
	if ('error' in result) fail(400, result.error);
	if (result.added.length > 0)
		void publishGroupUpdated(
			group.id,
			[...group.members.map((m) => m.id), ...result.added],
			result.events
		);
	return getGroupInfo(me, group.id);
}

/** Leaves the group (your own username), or removes someone else (owner only). */
export async function removeFromGroup(me: User, id: number | null, username: string) {
	const group = await groupOf(me, id);
	const target = group.members.find((m) => m.username === username);
	if (!target) fail(404, 'Not a member of this group');
	if (target.id !== me.id && group.ownerId !== me.id)
		fail(403, 'Only the owner of the group can remove people');
	thrown(manageLimited(me.id));
	const result = await removeMember(group.id, me.id, target.id);
	if (result.deleted) await removeUploads(result.images);
	// the removed member is told too, so the group goes away from their screens
	if (result.removed)
		void publishGroupUpdated(
			group.id,
			group.members.map((m) => m.id),
			result.events
		);
}

export async function typingInGroup(locals: App.Locals, me: User, id: number | null) {
	if (locals.muted) return;
	rateLimit(`typing:${me.id}`, MAX_TYPING);
	const group = await groupOf(me, id);
	publishTyping(
		me,
		group.members.map((m) => m.id),
		group.id
	);
}
