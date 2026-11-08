import { fail } from './api.js';

/**
 * A media file sent as a request body: the raw bytes (what non-browser clients should do, since
 * SvelteKit refuses multipart forms without a matching Origin), or multipart with the file in one
 * of `fields` (browsers). Accepts images (10mb), video and audio (599mb).
 */
export async function readUploadBody(request: Request, maxBytes: number, fields: string[]) {
	const type = request.headers.get('content-type') ?? '';
	if (Number(request.headers.get('content-length')) > maxBytes + 64 * 1024)
		fail(413, `File too big, max size is ${Math.round(maxBytes / 1024 / 1024)}mb`);
	let buffer: Buffer;
	if (type.startsWith('multipart/form-data')) {
		let form: FormData;
		try {
			form = await request.formData();
		} catch {
			fail(400, 'Upload too big or invalid');
		}
		const file = fields.map((f) => form.get(f)).find((f): f is File => f instanceof File);
		if (!file || file.size === 0)
			fail(400, `Missing file: send it as the body or in a "${fields[0]}" field`);
		buffer = Buffer.from(await file.arrayBuffer());
	} else {
		buffer = Buffer.from(await request.arrayBuffer());
		if (buffer.length === 0) fail(400, 'Missing file, send it as the request body');
	}
	if (buffer.length > maxBytes)
		fail(413, `File too big, max size is ${Math.round(maxBytes / 1024 / 1024)}mb`);
	return buffer;
}

/**
 * An image sent as a request body: the raw bytes (what non-browser clients should do, since
 * SvelteKit refuses multipart forms without a matching Origin), or multipart with the file in one
 * of `fields` (browsers).
 */
export async function readImageBody(request: Request, maxBytes: number, fields: string[]) {
	return readUploadBody(request, maxBytes, fields);
}
