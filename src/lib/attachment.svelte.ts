import { isVideo, isAudio } from '#lib/media.js';

/** A failed upload, with the message to show. */
export class UploadError extends Error {}

/**
 * A file picked in the post composer or the chat input. It's uploaded (and compressed/forwarded
 * on the server) right away, so sending only has to pass its id as `uploads`.
 */
export class Attachment {
	readonly file: File;
	/** local preview, shown until the sent post or message comes back */
	readonly url: string;
	/** whether this is a video file */
	readonly video: boolean;
	/** whether this is an audio file */
	readonly audio: boolean;
	/** share of the file sent so far, 0 to 1; the server is still processing it at 1 */
	progress = $state(0);
	/** set once the server holds the processed file */
	id: string | null = $state(null);
	/** set when the upload failed */
	failed = $state(false);
	/** resolves to the id, rejects with a message to show when the upload fails */
	done!: Promise<string>;
	#xhr: XMLHttpRequest | null = null;

	constructor(file: File) {
		this.file = file;
		this.url = URL.createObjectURL(file);
		this.video = file.type.startsWith('video/') || isVideo(file.name);
		this.audio = file.type.startsWith('audio/') || isAudio(file.name);
		this.upload();
	}

	/** (Re)starts the upload, also after the server let it expire. */
	upload() {
		this.#xhr?.abort();
		this.progress = 0;
		this.id = null;
		this.failed = false;
		const done = new Promise<string>((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			this.#xhr = xhr;
			xhr.open('POST', '/api/v1/uploads');
			xhr.upload.onprogress = (e) => {
				if (e.lengthComputable) this.progress = e.loaded / e.total;
			};
			xhr.onload = () => {
				this.#xhr = null;
				if (xhr.status === 201 || xhr.status === 200) {
					try {
						const { id } = JSON.parse(xhr.responseText) as { id: string };
						this.progress = 1;
						this.id = id;
						return resolve(id);
					} catch {
						return reject(new UploadError('Something went wrong.'));
					}
				}
				reject(
					new UploadError(
						[400, 403, 429].includes(xhr.status)
							? errorText(xhr.responseText)
							: xhr.status === 413
								? 'File is too big.'
								: 'Could not upload the file.'
					)
				);
			};
			xhr.onerror = () => {
				this.#xhr = null;
				reject(new UploadError('Could not upload the file, check your connection.'));
			};
			xhr.onabort = () => reject(new UploadError('Upload cancelled.'));
			const body = new FormData();
			body.set('file', this.file);
			xhr.send(body);
		});
		this.done = done;
		// a failure is handled where it's awaited; this also keeps it from being reported as unhandled
		done.catch(() => {
			if (this.done === done) this.failed = true;
		});
	}

	/** Frees the preview, once the post or message showing it has been sent. */
	release() {
		URL.revokeObjectURL(this.url);
	}

	/** Removed before sending: stops the upload and deletes it from the server. */
	discard() {
		this.#xhr?.abort();
		this.release();
		this.unstage();
	}

	/**
	 * Deletes the uploaded copy from the server but keeps the preview, before switching profile.
	 * Sending afterwards gets a 410 and uploads it again. An upload still running is left alone:
	 * the reload ends it, or it finishes if the switch fails.
	 */
	unstage() {
		if (this.id) {
			fetch(`/api/v1/uploads/${this.id}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				keepalive: true
			}).catch(() => {});
		}
	}
}

/**
 * Waits for the uploads and returns their ids, in order. Throws the first UploadError.
 * `fresh` forces new uploads, after the server said some expired.
 */
export async function uploadIds(attachments: Attachment[], fresh = false): Promise<string[]> {
	if (fresh) for (const a of attachments) a.upload();
	return Promise.all(attachments.map((a) => a.done));
}

/** The message of an API error body (`{ "error": "…" }`). */
function errorText(body: string) {
	try {
		return (JSON.parse(body) as { error?: string }).error || 'Could not upload the file.';
	} catch {
		return body || 'Could not upload the file.';
	}
}
