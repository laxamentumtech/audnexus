import axios, { AxiosError, AxiosResponse } from 'axios'

/**
 * Fetches a url with axios and retries 3 additional times on non-200 status
 * @param {string} url The url to fetch
 * @param {object} options The options to pass to axios (default: {})
 * @param {number} retries The number of retries to start from (default: 0)
 * @returns {Promise<AxiosResponse>} the response from the request
 */
function fetchPlus(url: string, options = {}, retries = 0): Promise<AxiosResponse> {
	return new Promise((resolve, reject) => {
		axios
			.get(url, options)
			.then((response: AxiosResponse) => {
				if (response.status === 200) {
					resolve(response)
				} else {
					reject(response)
				}
			})
			.catch((reason: AxiosError) => {
				if (retries < 3) {
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
