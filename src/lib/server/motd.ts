import { eq } from 'drizzle-orm';
import { db, settings } from '#lib/server/db/index.js';

/** The message of the day, shown as the placeholder of the post composer. */
export const DEFAULT_MOTD = 'twitter sucks';
export const MAX_MOTD = 100;

// read on every page load, so it is kept in memory and only refreshed when an admin changes it
let cached: Promise<string> | null = null;

export function getMotd(): Promise<string> {
	cached ??= db
		.select({ value: settings.value })
		.from(settings)
		.where(eq(settings.key, 'motd'))
		.then((rows) => rows[0]?.value || DEFAULT_MOTD)
		.catch((e) => {
			// don't keep a failed read around
			cached = null;
			throw e;
		});
	return cached;
}

/** Sets the message of the day; an empty one goes back to the default. */
export async function setMotd(motd: string) {
	if (motd) {
		await db
			.insert(settings)
			.values({ key: 'motd', value: motd })
			.onConflictDoUpdate({ target: settings.key, set: { value: motd } });
	} else {
		await db.delete(settings).where(eq(settings.key, 'motd'));
	}
	cached = Promise.resolve(motd || DEFAULT_MOTD);
}
