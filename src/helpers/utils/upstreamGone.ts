import { NotFoundError } from '#helpers/errors/ApiErrors'
import { ErrorMessageUpstreamGone } from '#static/messages'

/** Audible 301s a dead author/book deep link to this search URL (verified live
 * 2026-11-06: live page → 200, dead page → 301 → this path → 503). */
export const UPSTREAM_GONE_REDIRECT_MARKER = '/search?advsearchKeywords='

/** True when a response's final URL is Audible's search-page redirect. */
export function isUpstreamGoneRedirect(responseUrl: string | undefined): boolean {
	return !!responseUrl && responseUrl.includes(UPSTREAM_GONE_REDIRECT_MARKER)
}

/** Terminal "the upstream page does not exist" signal: never retried, never
 * relaxed/raised through the adaptive cooldown, and excluded from later update
 * passes by the scheduler (see UpdateScheduler.markChecked). Subclasses
 * NotFoundError so GenericShowHelper/StitchHelper rethrow it unchanged. */
export class UpstreamGoneError extends NotFoundError {
	constructor(url: string) {
		super(ErrorMessageUpstreamGone(url), { code: 'UPSTREAM_GONE' })
		this.name = 'UpstreamGoneError'
	}
}
