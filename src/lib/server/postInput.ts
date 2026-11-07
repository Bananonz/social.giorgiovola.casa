import { eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { User } from '#lib/types.js';
import { extractHashtags } from '#lib/hashtags.js';
import { db, post_hashtags, posts, users } from './db/index.js';
import { ApiError, fail } from './api.js';
import { checkPostRefs, createPost, deletePost, getPosts } from './posts.js';
import { LIMITS, parseId, parsePoll } from './validation.js';
import {
	ImageError,
	POST_IMAGE_SIZE,
	removeUploads,
	saveUpload,
	sniffImage,
	toWebp
} from './images.js';
import { actionsLimited, canDeletePostOf } from './moderation.js';
import { checkStaged, claimStaged, parseStagedIds } from './stagedUploads.js';
import { broadcast } from './realtime.js';

/** Writing posts: the input of a new post, editing and deleting. */

type RawPost = { body: Record<string, unknown>; files: File[] };

/**
 * The body of a new post: JSON (`uploads` are ids from POST /api/v1/uploads), or multipart with
 * `images` files for browsers. A poll is `{ options, duration_minutes }` (`minutes` too).
 */
export async function readPostBody(request: Request): Promise<RawPost> {
	if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
		let form: FormData;
		try {
			form = await request.formData();
		} catch {
			fail(400, 'Upload too big or invalid');
		}
		return {
			body: {
				content: form.get('content'),
				uploads: form.getAll('uploads'),
				reply_to: form.get('reply_to') || null,
				quote_of: form.get('quote_of') || null,
				poll: form.has('poll_options')
					? { options: form.getAll('poll_options'), minutes: form.get('poll_minutes') }
					: null
			},
			files: form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0)
		};
	}
	let body: unknown;
	try {
		const text = await request.text();
		body = text.trim() ? JSON.parse(text) : {};
	} catch {
		fail(400, 'Invalid JSON body');
	}
	if (!body || typeof body !== 'object' || Array.isArray(body))
		fail(400, 'The body must be a JSON object');
	return { body: body as Record<string, unknown>, files: [] };
}

const unwrap = <T>(value: T | Response): T => {
	if (value instanceof Response) throw value;
	return value;
};

/** Validates and writes a new post, reply or quote by `user`, with its images and poll. */
export async function submitPost(
	user: Pick<User, 'id' | 'username' | 'name' | 'avatar'>,
	{ body, files }: RawPost
) {
	const staged = unwrap(parseStagedIds(body.uploads));
	if (body.content != null && typeof body.content !== 'string')
		fail(400, 'content must be a string');
	const content = typeof body.content === 'string' ? body.content.trim() : '';
	if (!content && files.length === 0 && staged.length === 0) fail(400, 'Missing content');
	if (content.length > LIMITS.postContent)
		fail(400, `Posts can be at most ${LIMITS.postContent} characters`);

	const pollBody = body.poll;
	if (pollBody != null && (typeof pollBody !== 'object' || Array.isArray(pollBody)))
		fail(400, 'poll must be an object: { "options": [...], "duration_minutes": n }');
	const p = (pollBody ?? null) as Record<string, unknown> | null;
	const poll = parsePoll(p?.options, p?.duration_minutes ?? p?.minutes);
	if ('error' in poll) fail(400, poll.error);
	if (poll.poll && !content) fail(400, 'A poll needs a question');
	if (files.length + staged.length > LIMITS.postImages)
		fail(400, `Posts can have at most ${LIMITS.postImages} images`);

	// validate everything before anything is written to disk
	const uploads: { buffer: Buffer; ext: string }[] = [];
	for (const file of files) {
		if (file.size > LIMITS.imageBytes) fail(400, 'Image too big, max size is 10mb');
		const buffer = Buffer.from(await file.arrayBuffer());
		const ext = sniffImage(buffer);
		if (!ext) fail(400, 'Unsupported image type, use PNG, JPEG, GIF, WebP, AVIF, BMP, ICO or SVG');
		uploads.push({ buffer, ext });
	}

	const reply_to = body.reply_to != null ? parseId(body.reply_to) : null;
	if (body.reply_to != null && reply_to === null) fail(400, 'Invalid reply_to');
	const quote_of = body.quote_of != null ? parseId(body.quote_of) : null;
	if (body.quote_of != null && quote_of === null) fail(400, 'Invalid quote_of');
	const refError = await checkPostRefs(reply_to, quote_of);
	if (refError) fail(refError.status, refError.message);
	const stagedMissing = checkStaged(user.id, staged);
	if (stagedMissing) throw stagedMissing;

	let optimized: Buffer[];
	try {
		optimized = await Promise.all(
			uploads.map((u) => toWebp(u.buffer, u.ext, { size: POST_IMAGE_SIZE }))
		);
	} catch (e) {
		if (e instanceof ImageError) fail(400, e.message);
		throw e;
	}
	const saved = await Promise.all(optimized.map(saveUpload));
	const claimed = await claimStaged(user.id, staged);
	if (claimed instanceof Response) {
		await removeUploads(saved);
		throw claimed;
	}
	const images = [...saved, ...claimed];

	try {
		return await createPost(user, { content, images, reply_to, quote_of, poll: poll.poll });
	} catch (e) {
		await removeUploads(images);
		throw e;
	}
}

/**
 * Edits the text of one of `user`'s own posts (images and polls stay as they are). Its hashtags
 * follow the new text. Realtime clients get a `post_edited` event.
 */
export async function editPost(user: Pick<User, 'id'>, postId: number, rawContent: string) {
	const [post] = await db
		.select({ user_id: posts.user_id, images: posts.images })
		.from(posts)
		.where(eq(posts.id, postId));
	if (!post) fail(404, 'Post not found');
	if (post.user_id !== user.id) fail(403, 'You can only edit your own posts');
	const content = rawContent.trim();
	if (!content && post.images.length === 0) fail(400, 'Missing content');
	if (content.length > LIMITS.postContent)
		fail(400, `Posts can be at most ${LIMITS.postContent} characters`);

	await db.transaction(async (tx) => {
		await tx
			.update(posts)
			.set({ content, edited_at: sql`NOW()` })
			.where(eq(posts.id, postId));
		await tx.delete(post_hashtags).where(eq(post_hashtags.post_id, postId));
		const tags = extractHashtags(content);
		if (tags.length)
			await tx.insert(post_hashtags).values(tags.map((tag) => ({ post_id: postId, tag })));
	});
	const [updated] = await getPosts({ postId, loggedUser: user });
	const [anonymous] = await getPosts({ postId });
	if (anonymous) broadcast('post_edited', anonymous);
	return updated;
}

/**
 * Deletes a post with its replies: its author can, and staff can delete the posts of accounts
 * they outrank.
 */
export async function deletePostAs(locals: App.Locals, postId: number) {
	const user = locals.user;
	if (!user) fail(401, 'Sign in first');
	// the author's account decides whether a moderator may delete it
	const account = alias(users, 'account');
	const [target] = await db
		.select({ user_id: posts.user_id, role: account.role })
		.from(posts)
		.innerJoin(users, eq(posts.user_id, users.id))
		.innerJoin(account, eq(account.id, sql`COALESCE(${users.owner_id}, ${users.id})`))
		.where(eq(posts.id, postId));
	if (!target) fail(404, 'Post not found');
	if (target.user_id !== user.id) {
		if (locals.auth === 'bot' || !canDeletePostOf(locals, target.role))
			fail(403, 'You can only delete your own posts');
		if (actionsLimited(locals.accountId ?? user.id)) throw new ApiError(429, 'Slow down');
	}
	if (!(await deletePost(postId))) fail(404, 'Post not found');
}
