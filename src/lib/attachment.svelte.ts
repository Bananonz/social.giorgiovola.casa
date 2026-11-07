/** A failed upload, with the message to show. */
export class UploadError extends Error {}

/**
 * An image picked in the post composer or the chat input. It's uploaded (and compressed on the
 * server) right away, so sending only has to pass its id as `uploads`.
 */
export class Attachment {
	readonly file: File;
	/** local preview, shown until the sent post or message comes back */
	readonly url: string;
	/** share of the file sent so far, 0 to 1; the server is still compressing it at 1 */
	progress = $state(0);
	/** set once the server holds the compressed image */
	id: string | null = $state(null);
	/** set when the upload failed */
	failed = $state(false);
	/** resolves to the id, rejects with a message to show when the upload fails */
	done!: Promise<string>;
	#xhr: XMLHttpRequest | null = null;

	constructor(file: File) {
		this.file = file;
		this.url = URL.createObjectURL(file);
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
							? 'Image is too big.'
							: 'Could not upload the image.'
					)
				);
			};
			xhr.onerror = () => {
				this.#xhr = null;
				reject(new UploadError('Could not upload the image, check your connection.'));
			};
			xhr.onabort = () => reject(new UploadError('Upload cancelled.'));
			const body = new FormData();
			body.set('image', this.file);
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
		return (JSON.parse(body) as { error?: string }).error || 'Could not upload the image.';
	} catch {
		return body || 'Could not upload the image.';
	}
}
