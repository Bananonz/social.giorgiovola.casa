import { desc, eq, isNotNull } from 'drizzle-orm';
import type { Post, User } from '#lib/types.js';
import { db, likes, posts, regiorgs, users } from './db/index.js';
import { followedAuthors, getPinnedId, getPosts, getTimeline, profileAuthor } from './posts.js';

/** Lists of posts: every function returns `limit + 1` rows, the extra one tells there is more. */

type Viewer = Pick<User, 'id'> | null;

export type Feed = 'all' | 'following';

/**
 * The home timeline. "all" already has every post, so only the following feed brings in
 * regiorgs. The posts staff pinned to the timeline sit above both feeds, so they are left out.
 */
export function homeTimeline(feed: Feed, viewer: Viewer, limit: number, offset: number) {
	if (feed === 'following' && viewer)
		return getTimeline({
			loggedUser: viewer,
			authors: followedAuthors(viewer.id),
			excludeReplies: true,
			excludeTimelinePinned: true,
			limit: limit + 1,
			offset
		});
	return getPosts({
		loggedUser: viewer,
		excludeReplies: true,
		excludeTimelinePinned: true,
		order: 'DESC',
		limit: limit + 1,
		offset
	});
}

export type ProfileTab = 'posts' | 'replies';

/**
 * A profile's posts (with its regiorgs, the pinned post left out: it sits above them) or its
 * replies. Null when the profile doesn't exist.
 */
export async function profilePosts(
	username: string,
	tab: ProfileTab,
	viewer: Viewer,
	limit: number,
	offset: number
): Promise<Post[] | null> {
	const [profile] = await db
		.select({ id: users.id, pinned: users.pinned_post_id })
		.from(users)
		.where(eq(users.username, username));
	if (!profile) return null;
	if (tab === 'replies')
		return getPosts({
			loggedUser: viewer,
			fromUser: { id: profile.id },
			where: isNotNull(posts.reply_to),
			order: 'DESC',
			limit: limit + 1,
			offset
		});
	return getTimeline({
		loggedUser: viewer,
		authors: profileAuthor(username),
		excludeReplies: true,
		excludeId: profile.pinned,
		limit: limit + 1,
		offset
	});
}

/** The post pinned to a profile; undefined when the profile doesn't exist. */
export async function pinnedPost(username: string, viewer: Viewer) {
	const [profile] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.username, username));
	if (!profile) return undefined;
	const id = await getPinnedId(profile.id);
	if (id === null) return null;
	const [post] = await getPosts({ loggedUser: viewer, postId: id });
	return post ?? null;
}

export const hashtagPosts = (tag: string, viewer: Viewer, limit: number, offset: number) =>
	getPosts({ loggedUser: viewer, hashtag: tag, order: 'DESC', limit: limit + 1, offset });

/** Replies to a post: the ones that ratio it first, then oldest first. */
export const postReplies = (postId: number, viewer: Viewer, limit: number, offset: number) =>
	getPosts({
		loggedUser: viewer,
		reply_to: postId,
		order: 'ASC',
		ratioFirst: true,
		limit: limit + 1,
		offset
	});

export async function getPost(postId: number, viewer: Viewer) {
	const [post] = await getPosts({ loggedUser: viewer, postId });
	return post ?? null;
}

const postExists = async (postId: number) => (await db.$count(posts, eq(posts.id, postId))) > 0;

const profileColumns = { username: users.username, name: users.name, avatar: users.avatar };

/** Who liked a post, latest first. Null when the post doesn't exist. */
export async function postLikes(postId: number, limit: number, offset: number) {
	if (!(await postExists(postId))) return null;
	return db
		.select(profileColumns)
		.from(likes)
		.innerJoin(users, eq(users.id, likes.user_id))
		.where(eq(likes.post_id, postId))
		.orderBy(desc(likes.created_at), desc(likes.user_id))
		.limit(limit + 1)
		.offset(offset);
}

/** Who regiorged a post, latest first. */
export async function postRegiorgs(postId: number, limit: number, offset: number) {
	if (!(await postExists(postId))) return null;
	return db
		.select(profileColumns)
		.from(regiorgs)
		.innerJoin(users, eq(users.id, regiorgs.user_id))
		.where(eq(regiorgs.post_id, postId))
		.orderBy(desc(regiorgs.created_at), desc(regiorgs.user_id))
		.limit(limit + 1)
		.offset(offset);
}

/** The quote regiorgs of a post, latest first: who quoted it and what they wrote. */
export async function postQuotes(postId: number, limit: number, offset: number) {
	if (!(await postExists(postId))) return null;
	return db
		.select({ id: posts.id, content: posts.content, ...profileColumns })
		.from(posts)
		.innerJoin(users, eq(users.id, posts.user_id))
		.where(eq(posts.quote_of, postId))
		.orderBy(desc(posts.created_at), desc(posts.id))
		.limit(limit + 1)
		.offset(offset);
}
