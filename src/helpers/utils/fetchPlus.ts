import { AxiosError, AxiosResponse } from 'axios'

import pooledAxios from './connectionPool'

/**
 * Calculates the delay for retry attempts with exponential backoff.
 * For 429 status, uses exponential backoff starting at 1s, doubling each retry (max 8s).
 * Respects Retry-After header if present.
 * @param {number} retries The current retry count
 * @param {AxiosError} error The axios error response
 * @returns {number} The delay in milliseconds
 */
function calculateRetryDelay(retries: number, error: AxiosError): number {
	const retryAfter = error.response?.headers?.['retry-after']
	if (retryAfter) {
		// Retry-After can be a delay in seconds or a date
		const parsed = parseInt(retryAfter, 10)
		if (!isNaN(parsed)) {
			return parsed * 1000
		}
	}

	// Exponential backoff: 1s, 2s, 4s, max 8s
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
