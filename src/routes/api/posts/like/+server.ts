import { and, eq } from 'drizzle-orm';
import { db, likes, posts } from '#lib/server/db/index.js';
import { parseId } from '#lib/server/validation.js';
import { publishLikes } from '#lib/server/realtime.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return new Response(null, { status: 401 });
	}

	const user = locals.user;
	let id: number | null = null;
	// optional state to set: without it the like toggles. the client always sends it, so a
	// double tap (always a like) and quick repeated clicks can't flip it the wrong way
	let wanted: boolean | undefined;
	try {
		const body = await request.json();
		id = parseId(body?.id);
		if (typeof body?.liked === 'boolean') wanted = body.liked;
	} catch {
		// invalid JSON, handled below
	}
	if (id === null) {
		return new Response(null, { status: 400 });
	}
	const postId = id;

	const [post] = await db
		.select({ id: posts.id, user_id: posts.user_id })
		.from(posts)
		.where(eq(posts.id, postId));
	if (!post) return new Response(null, { status: 404 });

	const { liked, total } = await db.transaction(async (tx) => {
		let liked = wanted ?? true;
		if (liked) {
			const res = await tx
				.insert(likes)
				.values({ user_id: user.id, post_id: postId })
				.onConflictDoNothing({ target: [likes.user_id, likes.post_id] })
				.returning();
			// already liked: a toggle takes it back, an explicit like leaves it
			if (res.length === 0 && wanted === undefined) liked = false;
		}
		if (!liked) {
			await tx.delete(likes).where(and(eq(likes.user_id, user.id), eq(likes.post_id, postId)));
		}
		const total = await tx.$count(likes, eq(likes.post_id, postId));
		return { liked, total };
	});

	void publishLikes(postId, post.user_id, total);
	// return the absolute count: the SSE `counts` event may reach this client before
	// the response does, so the client must set it rather than increment
	return new Response(JSON.stringify({ liked, likes: total }), {
		headers: { 'Content-Type': 'application/json' }
	});
};
