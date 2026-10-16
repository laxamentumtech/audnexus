import { AxiosError, AxiosResponse } from 'axios'

import { registerRateLimited } from '#helpers/utils/adaptiveCooldown'
import pooledAxios from '#helpers/utils/connectionPool'
import sleep from '#helpers/utils/sleep'

const MAX_BACKOFF_MS = 8000

// HTTP statuses that warrant retry with exponential backoff + jitter.
// 429/503/504 are upstream rate-limit signals (Audible throttles with 503).
// Static literal lookup per project style (Record over Set for fixed keys).
const TRANSIENT_STATUSES: Record<number, true> = { 429: true, 503: true, 504: true }

/** Convert a rate-limit response's Retry-After header to milliseconds, or
 * undefined when absent/unparseable. Accepts delay-seconds and HTTP-date. */
function retryAfterToMs(error: AxiosError): number | undefined {
	const retryAfter = error.response?.headers?.['retry-after']
	if (!retryAfter || typeof retryAfter !== 'string') return undefined
	if (/^\d+$/.test(retryAfter)) {
		const seconds = parseInt(retryAfter, 10)
		return seconds >= 0 ? seconds * 1000 : undefined
	}
	const parsedDate = new Date(retryAfter)
	if (isNaN(parsedDate.getTime())) return undefined
	const delay = parsedDate.getTime() - Date.now()
	return delay > 0 ? delay : undefined
}

/**
 * Calculates the delay for retry attempts with exponential backoff.
 * 429/503/504 are upstream rate-limit signals (Audible throttles with 503);
 * Retry-After is honored on all of them when present, else exponential
 * backoff from 1s doubling per retry (capped at 8s).
 * Each rate-limit response also raises the process-wide adaptive cooldown
 * consumed by batch loops between items.
 * @param {number} retries The current retry count
 * @param {AxiosError} error The axios error response
 * @returns {number} The delay in milliseconds
 */
function calculateRetryDelay(retries: number, error: AxiosError): number {
	// Honor Retry-After for any rate-limit status; parse delay-in-seconds and
	// HTTP-date forms.
	if (error.response?.headers) {
		const retryAfter = error.response.headers['retry-after']
		if (retryAfter) {
			// Retry-After can be a delay in seconds or an HTTP-date
			// Validate digits-only before parseInt to avoid accepting garbage
			if (typeof retryAfter === 'string' && /^\d+$/.test(retryAfter)) {
				const parsedAsNumber = parseInt(retryAfter, 10)
				if (parsedAsNumber >= 0) {
					return Math.min(parsedAsNumber * 1000, MAX_BACKOFF_MS)
				}
			}

			// Try parsing as an HTTP-date
			const parsedDate = new Date(retryAfter)
			if (!isNaN(parsedDate.getTime())) {
				const now = Date.now()
				const delay = parsedDate.getTime() - now
				if (delay > 0) {
					return Math.min(delay, MAX_BACKOFF_MS)
				}
			}
		}
	}

	// Exponential backoff (no Retry-After): 1s, 2s, 4s, capped at 8s
	return Math.min(1000 * Math.pow(2, retries), MAX_BACKOFF_MS)
}

/**
 * Fetches a url with axios and retries 3 additional times on non-200 status
 * Uses connection pooling for improved performance.
 * Implements exponential backoff for 429 (Too Many Requests) responses,
 * respecting Retry-After header when present.
 * @param {string} url The url to fetch
 * @param {object} options The options to pass to axios (default: {})
 * @param {number} retries The number of retries to start from (default: 0)
 * @returns {Promise<AxiosResponse>} the response from the request
 */
function fetchPlus(url: string, options = {}, retries = 0): Promise<AxiosResponse> {
	return new Promise((resolve, reject) => {
		pooledAxios
			.get(url, options)
			.then((response: AxiosResponse) => {
				if (response.status === 200) {
					// No cooldown decay here: a bare 200 is not proof the response
					// was usable — Audible's region-unavailable refusals are
					// 200-valued, and decaying on them kept knocking on a closed
					// window all night (2026-10-06/07 soak). Decay happens at the
					// item level, where the consumer knows the data was real.
					resolve(response)
				} else {
					reject(response)
				}
			})
			.catch(async (reason: AxiosError) => {
				const status = reason.response?.status
				if (status && TRANSIENT_STATUSES[status]) {
					// Rate-limit signal: raise the process-wide adaptive cooldown.
					// Retry-After hints feed both the retry delay and the cooldown.
					registerRateLimited(retryAfterToMs(reason))
				}
				if (retries < 3) {
					// Transient (429/503/504) responses back off before retrying.
					if (status && TRANSIENT_STATUSES[status]) {
						const delay = calculateRetryDelay(retries, reason)
						// 429 keeps the exact Retry-After/backoff delay (asserted in tests);
						// 503/504 add bounded jitter (up to 250ms) to spread retries.
						const finalDelay = status === 429 ? delay : delay + Math.floor(Math.random() * 250)
						await sleep(finalDelay)
					}

					fetchPlus(url, options, retries + 1)
						.then(resolve)
						.catch(reject)
				} else {
					reject(reason.response)
				}
			})
	})
}

export default fetchPlus
