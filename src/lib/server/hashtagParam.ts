import { normalizeTag, parseHashtag } from '#lib/hashtags.js';
import { fail } from './api.js';

/** The normalized tag of a path parameter ("#" optional), or a 404 when it isn't a hashtag. */
export function tagParam(param: string) {
	const parsed = parseHashtag('#' + param.replace(/^#/, ''));
	if (!parsed || parsed.rest) fail(404, 'Not a hashtag');
	return normalizeTag(parsed.tag);
}
