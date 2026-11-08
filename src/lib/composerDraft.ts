/**
 * Keeps what's in the post composers across a profile switch, which reloads the page. Saved only
 * right before switching and taken back (once) by the matching composer after the reload. The
 * images are kept as files in IndexedDB: their uploads belong to the old profile, so they're
 * uploaded again as the new one.
 */

export type ComposerDraft = {
	/** which composer it's from: `post`, `reply:<id>` or `quote:<id>` */
	key: string;
	content: string;
	pollOptions: string[] | null;
	pollMinutes: number;
	files: File[];
};

type Stored = ComposerDraft & { savedAt: number };

/** a draft not taken back by then (the composer isn't on the new page) is dropped */
const MAX_AGE_MS = 10 * 60_000;
/** how long a switch waits for the composers, which may wait for posts on their way */
const SAVE_TIMEOUT_MS = 15_000;

const DB_NAME = 'composer-drafts';
const STORE = 'drafts';

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function withStore<T>(
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await openDb();
	try {
		return await new Promise<T>((resolve, reject) => {
			const tx = db.transaction(STORE, mode);
			const req = run(tx.objectStore(STORE));
			tx.oncomplete = () => resolve(req.result);
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}

async function put(draft: ComposerDraft) {
	const stored: Stored = { ...draft, savedAt: Date.now() };
	await withStore('readwrite', (s) => s.put(stored));
}

async function remove(key: string) {
	await withStore('readwrite', (s) => s.delete(key));
}

/** The draft saved for this composer, if any; it's removed, so it only comes back once. */
export async function takeDraft(key: string): Promise<ComposerDraft | null> {
	try {
		const stored = await withStore<Stored | undefined>('readonly', (s) => s.get(key));
		if (!stored) return null;
		await remove(key);
		if (Date.now() - stored.savedAt > MAX_AGE_MS) return null;
		// some browsers give a File back as a plain Blob
		const files = stored.files.map((f) =>
			f instanceof File ? f : new File([f], 'image', { type: (f as Blob).type })
		);
		return { ...stored, files };
	} catch {
		// private mode or blocked storage: nothing was saved either
		return null;
	}
}

/**
 * Called before a switch. Returns the composer's draft (null when empty) after dropping its
 * uploads, which the next profile can't use and couldn't delete.
 */
type Saver = () => Promise<ComposerDraft | null>;

const savers = new Set<Saver>();

/** Registers an open composer; returns the function that unregisters it. */
export function onProfileSwitch(saver: Saver): () => void {
	savers.add(saver);
	return () => savers.delete(saver);
}

/** Saves every open composer's draft. Returns the saved keys, to drop them if the switch fails. */
export async function saveDrafts(): Promise<string[]> {
	const timeout = new Promise<null>((r) => setTimeout(() => r(null), SAVE_TIMEOUT_MS));
	const drafts = await Promise.all(
		[...savers].map((save) => Promise.race([save().catch(() => null), timeout]))
	);
	const keys: string[] = [];
	for (const draft of drafts) {
		if (!draft) continue;
		try {
			await put(draft);
			keys.push(draft.key);
		} catch {
			// storage unavailable: switching still works, the draft is lost as before
		}
	}
	return keys;
}

/** Drops drafts saved for a switch that then failed, so they don't come back later. */
export async function dropDrafts(keys: string[]) {
	await Promise.all(keys.map((key) => remove(key).catch(() => {})));
}
