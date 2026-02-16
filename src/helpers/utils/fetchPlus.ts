import { AxiosError, AxiosResponse } from 'axios'

import pooledAxios from './connectionPool'

/**
 * Calculates the delay for retry attempts with exponential backoff.
 * For 429 status, uses exponential backoff starting at 1s, doubling each retry (max 8s).
 * Respects Retry-After header if present (includes delay-in-seconds and HTTP-date formats).
 * @param {number} retries The current retry count
 * @param {AxiosError} error The axios error response
 * @returns {number} The delay in milliseconds
 */
function calculateRetryDelay(retries: number, error: AxiosError): number {
	if (!error.response || !error.response.headers) {
		// No response or headers, fall back to exponential backoff
		return Math.min(1000 * Math.pow(2, retries), 8000)
	}

	const retryAfter = error.response.headers['retry-after']
	if (!retryAfter) {
		// No Retry-After header, fall back to exponential backoff
		return Math.min(1000 * Math.pow(2, retries), 8000)
	}

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

	// Invalid Retry-After value, fall back to exponential backoff
	return Math.min(1000 * Math.pow(2, retries), 8000)
}

/**
 * Sleep for a given number of milliseconds
 * @param {number} ms The number of milliseconds to sleep
 * @returns {Promise<void>} A promise that resolves after the delay
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
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
					resolve(response)
				} else {
					reject(response)
				}
			})
			.catch(async (reason: AxiosError) => {
				if (retries < 3) {
					// Check if this is a 429 (Too Many Requests) response
					const status = reason.response?.status
					if (status === 429) {
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
