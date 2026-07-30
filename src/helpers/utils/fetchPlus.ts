import { AxiosError, AxiosResponse } from 'axios'

import pooledAxios from '#helpers/utils/connectionPool'
import sleep from '#helpers/utils/sleep'

const MAX_BACKOFF_MS = 8000

function jitter(base: number): number {
	return base + Math.floor(Math.random() * (base / 2 + 1)) - Math.floor(base / 4)
}

function parseRetryAfter(retryAfter: string): number | null {
	// Retry-After can be a delay in seconds or an HTTP-date
	const parsedAsNumber = parseInt(retryAfter, 10)
	if (!isNaN(parsedAsNumber) && parsedAsNumber > 0) {
		return parsedAsNumber * 1000
	}

	// Try parsing as HTTP-date (e.g., "Wed, 21 Oct 2015 07:28:00 GMT")
	const parsedDate = new Date(retryAfter)
	if (!isNaN(parsedDate.getTime())) {
		const now = Date.now()
		const delay = parsedDate.getTime() - now
		if (delay > 0) {
			return delay
		}
	}

	return null
}

/**
 * Calculates the delay for retry attempts with exponential backoff.
 * For 429 status, honors Retry-After header when present (delay-in-seconds and HTTP-date formats).
 * For 429 without Retry-After, 503, and 504, uses exponential backoff with bounded jitter
 * starting at 1s, doubling each retry (max 8s).
 * @param {number} retries The current retry count
 * @param {AxiosError} error The axios error response
 * @returns {number} The delay in milliseconds
 */
function calculateRetryDelay(retries: number, error: AxiosError): number {
	const status = error.response?.status
	const retryAfter = error.response?.headers?.['retry-after']

	// Only honor Retry-After for 429
	if (status === 429 && retryAfter) {
		const parsed = parseRetryAfter(retryAfter)
		if (parsed !== null) {
			return parsed
		}
	}

	// For 429 without Retry-After (or invalid), or any other retriable status: use exponential backoff with jitter
	return jitter(Math.min(1000 * Math.pow(2, retries), MAX_BACKOFF_MS))
}

/**
 * Fetches a url with axios and retries 3 additional times on non-200 status
 * Uses connection pooling for improved performance.
 * Implements exponential backoff with bounded jitter for 429, 503, and 504 responses.
 * For 429, respects Retry-After header when present.
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
					resolve(response)
				} else {
					reject(response)
				}
			})
			.catch(async (reason: AxiosError) => {
				if (retries < 3) {
					const status = reason.response?.status
					if (status === 429 || status === 503 || status === 504) {
						const delay = calculateRetryDelay(retries, reason)
						await sleep(delay)
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
