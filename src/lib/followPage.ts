import { redirect } from '@sveltejs/kit';
import type { Page } from './api.js';
import { apiGet } from './apiLoad.js';
import type { FollowListEntry } from './types.js';

type Profile = {
	username: string;
	name: string;
	avatar: string | null;
	followers: number;
	following: number;
	self: boolean;
	followedBy: { total: number };
};

export type FollowListName = 'followers' | 'following' | 'known';

export const PAGE_SIZE = 20;

/** The followers / following pages: the profile, its counts and the first page of the list. */
export async function loadFollowList(
	fetch: typeof globalThis.fetch,
	username: string,
	list: FollowListName,
	signedIn: boolean
) {
	const name = encodeURIComponent(username.toLowerCase());
	const profile = await apiGet<Profile>(fetch, `/users/${name}`, { login: false });
	// "followers you know" only makes sense for someone else's profile, when signed in
	const showKnown = signedIn && !profile.self;
	if (list === 'known' && !showKnown) redirect(303, `/@${profile.username}/followers`);
	const source = `/api/v1/users/${name}/${
		list === 'known' ? 'followers/known' : list
	}?limit=${PAGE_SIZE}`;
	const page = await apiGet<Page<FollowListEntry>>(fetch, source.slice('/api/v1'.length));
	return {
		profile: { username: profile.username, name: profile.name, avatar: profile.avatar },
		list,
		followers: profile.followers,
		following: profile.following,
		known: profile.followedBy.total,
		showKnown,
		entries: page.items,
		next: page.next_cursor,
		source
	};
}
