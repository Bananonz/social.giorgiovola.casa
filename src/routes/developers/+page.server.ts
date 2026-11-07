import type { PageServerLoad } from './$types';
import { PUBLIC_URL } from '$app/env/public';
import { apiGet } from '#lib/apiLoad.js';

type Limits = {
	postContent: number;
	messageContent: number;
	name: number;
	bio: number;
	username: number;
	maxBots: number;
	maxProfileUpdates: number;
	pollOptionsMin: number;
	pollOptionsMax: number;
	pollOption: number;
	pollMinutesMin: number;
	pollMinutesMax: number;
	pollMinutesDefault: number;
};

// public: the docs are for people deciding whether to build a bot, who may not have an account
export const load: PageServerLoad = async ({ url, fetch }) => ({
	origin: PUBLIC_URL ? new URL(PUBLIC_URL).origin : url.origin,
	limits: (await apiGet<{ limits: Limits }>(fetch, '/instance')).limits
});
