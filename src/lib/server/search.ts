import { asc, count, desc, eq, gt, ilike, like, or, sql } from 'drizzle-orm';
import { MAX_HASHTAG_LENGTH, normalizeTag } from '#lib/hashtags.js';
import type { HashtagResult, UserResult } from '#lib/types.js';
import { db, post_hashtags, posts, users } from './db/index.js';

export const MAX_QUERY_LENGTH = 64;
const TRENDING_DAYS = 7;

// the query is matched literally: % and _ are LIKE wildcards
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

/** Profiles whose username, name or a word of the name starts with `q`. */
export async function searchUsers(q: string, limit: number): Promise<UserResult[]> {
	q = q.trim().toLowerCase().slice(0, MAX_QUERY_LENGTH);
	if (!q) return [];
	const prefix = escapeLike(q) + '%';
	return (
		db
			.select({ username: users.username, name: users.name, avatar: users.avatar })
			.from(users)
			.where(
				or(
					like(users.username, prefix),
					ilike(users.name, prefix),
					ilike(users.name, '% ' + prefix)
				)
			)
			// exact username first, then username prefix matches, then name matches
			.orderBy(
				sql`(${users.username} = ${q}) DESC, (${users.username} LIKE ${prefix}) DESC`,
				asc(users.username)
			)
			.limit(limit)
	);
}

/** Hashtags starting with `q` ("#" optional), most used first. */
export async function searchHashtags(q: string, limit: number): Promise<HashtagResult[]> {
	const tag = normalizeTag(q.trim().replace(/^#/, '')).slice(0, MAX_HASHTAG_LENGTH);
	if (!tag || !/^[\p{L}\p{M}\p{N}_]+$/u.test(tag)) return [];
	return db
		.select({ tag: post_hashtags.tag, posts: count() })
		.from(post_hashtags)
		.where(like(post_hashtags.tag, escapeLike(tag) + '%'))
		.groupBy(post_hashtags.tag)
		.orderBy(sql`(${post_hashtags.tag} = ${tag}) DESC`, desc(count()), asc(post_hashtags.tag))
		.limit(limit);
}

/** The hashtags used the most in the last few days. */
export async function trendingHashtags(limit: number): Promise<HashtagResult[]> {
	return db
		.select({ tag: post_hashtags.tag, posts: count() })
		.from(post_hashtags)
		.innerJoin(posts, eq(posts.id, post_hashtags.post_id))
		.where(gt(posts.created_at, sql`now() - make_interval(days => ${TRENDING_DAYS})`))
		.groupBy(post_hashtags.tag)
		.orderBy(desc(count()), asc(post_hashtags.tag))
		.limit(limit);
}

/** How many posts have a hashtag. */
export const hashtagPosts = (tag: string) => db.$count(post_hashtags, eq(post_hashtags.tag, tag));

/**
 * Users and hashtags for a search box query: "#…" looks for hashtags only, "@…" for users only.
 * An empty query lists the trending hashtags.
 */
export async function search(q: string, limit: number) {
	q = q.trim().slice(0, MAX_QUERY_LENGTH);
	if (!q) return { query: q, users: [], hashtags: await trendingHashtags(limit) };
	const [users, hashtags] = await Promise.all([
		q.startsWith('#') ? [] : searchUsers(q.replace(/^@/, ''), limit),
		q.startsWith('@') ? [] : searchHashtags(q, limit)
	]);
	return { query: q, users, hashtags };
}

/**
 * Profiles for the @mention and people pickers: username or name starting with `q` (the
 * characters a mention can contain), the newest profiles when `q` is empty.
 */
export async function suggestUsers(raw: string, limit: number): Promise<UserResult[]> {
	const q = raw.trim().replace(/^@/, '').toLowerCase().slice(0, 32);
	// the same characters a mention can contain, which also keeps LIKE wildcards out
	if (!/^[a-z0-9_]*$/.test(q)) return [];
	return (
		db
			.select({ username: users.username, name: users.name, avatar: users.avatar })
			.from(users)
			.where(q ? or(ilike(users.username, `${q}%`), ilike(users.name, `${q}%`)) : undefined)
			// exact username first, then username prefix matches, then name matches
			.orderBy(
				q
					? sql`(${users.username} = ${q}) DESC, (${users.username} ILIKE ${q + '%'}) DESC`
					: desc(users.created_at),
				asc(users.username)
			)
			.limit(limit)
	);
}
