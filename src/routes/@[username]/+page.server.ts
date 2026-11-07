import type { PageServerLoad } from './$types';
import type { Page } from '#lib/api.js';
import { apiGet } from '#lib/apiLoad.js';
import type { FollowedBy, Post } from '#lib/types.js';

const PAGE_SIZE = 10;

type Profile = {
	username: string;
	name: string;
	avatar: string | null;
	bot: boolean;
	bio: string;
	website: string;
	followers: number;
	following: number;
	followed: boolean;
	self: boolean;
	followedBy: FollowedBy;
	created_at: string;
	moderation: {
		banned: boolean;
		muted: boolean;
		ban_reason: string | null;
		mute_reason: string | null;
		identity: boolean;
	} | null;
};

export const load = (async ({ params, fetch, depends, url }) => {
	depends('app:posts');
	const name = encodeURIComponent(params.username.toLowerCase());
	const tab = url.searchParams.get('tab') === 'replies' ? 'replies' : 'posts';
	const source = `/api/v1/users/${name}/posts?tab=${tab}&limit=${PAGE_SIZE}`;
	const [profile, page, pinned] = await Promise.all([
		apiGet<Profile>(fetch, `/users/${name}`, { login: false }),
		apiGet<Page<Post>>(fetch, source.slice('/api/v1'.length), { login: false }),
		tab === 'posts'
			? apiGet<{ post: Post | null }>(fetch, `/users/${name}/pinned`, { login: false })
			: { post: null }
	]);
	return {
		user: {
			name: profile.name,
			username: profile.username,
			avatar: profile.avatar,
			created_at: profile.created_at
		},
		bio: profile.bio,
		bot: profile.bot,
		website: profile.website,
		tab,
		posts: page.items,
		next: page.next_cursor,
		source,
		pinned: pinned.post,
		follow: {
			followers: profile.followers,
			following: profile.following,
			followed: profile.followed
		},
		followedBy: profile.followedBy,
		moderation: profile.moderation,
		self: profile.self
	};
}) satisfies PageServerLoad;
