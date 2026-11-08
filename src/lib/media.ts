/** file extension checks shared by client and server */

const VIDEO_RE = /\.(mp4|webm|mov)$/i;
const AUDIO_RE = /\.(mp3|ogg|wav|m4a)$/i;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i;

export function isVideo(url: string): boolean {
	return VIDEO_RE.test(url);
}

export function isAudio(url: string): boolean {
	return AUDIO_RE.test(url);
}

export function isImage(url: string): boolean {
	return IMAGE_RE.test(url);
}

/** accepted by the file picker: images, video and audio */
export const MEDIA_ACCEPT =
	'image/png,image/jpeg,image/gif,image/webp,image/avif,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/ogg,audio/wav,audio/mp4';

/** max file size for media uploaded to S3 (video/audio) */
export const MAX_MEDIA_BYTES = 599 * 1024 * 1024;

/** max file size for images (processed locally) */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
