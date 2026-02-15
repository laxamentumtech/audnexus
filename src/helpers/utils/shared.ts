import * as cheerio from 'cheerio'
import { Element } from 'domhandler'
import type { FastifyBaseLogger } from 'fastify'
import { htmlToText } from 'html-to-text'
import lodash from 'lodash'

import { ApiGenre, ApiGenreSchema, asin11Regex, baseAsin10Regex } from '#config/types'
import { PaprDocument } from '#config/typing/papr'
import { NoticeGenreNotAvailable } from '#static/messages'

class SharedHelper {
	logger?: FastifyBaseLogger

	constructor(logger?: FastifyBaseLogger) {
		this.logger = logger
	}
	/**
	 * Creates URL to use in fetchBook
	 * @param {string} ASIN The Audible ID to base the URL on
	 * @param {string} baseDomain The base domain to use for the FQDN
	 * @param {string} regionTLD The TLD of the region to use (without the dot)
	 * @param {string} baseUrl The base path to use for the URL
	 * @param {string} params Additional parameters to add to the URL
	 * @returns {string} full url to fetch.
	 */
	buildUrl(
		ASIN: string,
		baseDomain: string,
		regionTLD: string,
		baseUrl: string,
		params?: string
	): string {
		const FQDN = `${baseDomain}.${regionTLD}`
		const argArr = [FQDN, baseUrl, ASIN]
		const reqUrl = argArr.join('/') + (params ? `?${params}` : '')
		return reqUrl
	}

	/**
	 * Checks the presence of genres on html page and formats them into JSON.
	 * @param {string} asin the ASIN of the book or author
	 * @param {NodeListOf<Element>} genres selected source from categoriesLabel
	 * @param {string} type the type to assign to the returned objects
	 * @returns {ApiGenre[]}
	 */
	collectGenres(asin: string, genres: cheerio.Cheerio<Element>[], type: string): ApiGenre[] {
		// Check and label each genre
		const genreArr: ApiGenre[] = genres
			.map((genre, index) => {
				// Only proceed if there's an ID to use
				const href = genre.attr('href')
				if (href) {
					const catAsin = this.getGenreAsinFromUrl(href)
					// Verify existence of name and valid ID
					if (genre.text() && catAsin) {
						// Cleanup the name of the genre
						const cleanedName = htmlToText(genre.text(), { wordwrap: false })
						// Create the genre object
						const parsed = ApiGenreSchema.safeParse({
							asin: catAsin,
							name: cleanedName,
							type: type
						})
						if (parsed.success) return parsed.data
						this.logger?.warn(parsed.error)
					}
				} else {
					this.logger?.info(NoticeGenreNotAvailable(asin, index))
				}
			})
			.filter((genre) => genre) as ApiGenre[] // Filter out undefined values

		// Only return map if there's at least one genre
		if (genreArr.length > 0) {
			return genreArr
		}

		// If there's no genre, return an empty array
		return [] as ApiGenre[]
	}

	/**
	 * Checks whether the input data are identical
	 * @param {unknown} original
	 * @param {unknown} updated
	 * @returns {boolean}
	 */
	isEqualData(original: unknown, updated: unknown): boolean {
		if (lodash.isEqual(original, updated)) {
			return true
		}
		return false
	}

	/**
	 * Checks if the object was updated in the threshold period (default 7 days)
	 * @param obj object to check
	 * @returns {boolean} true if updated in the threshold period, false otherwise
	 */
	isRecentlyUpdated(obj: PaprDocument): boolean {
		// Get the environment variable for the number of days to check if it exists
		const threshold = process.env.UPDATE_THRESHOLD ? parseInt(process.env.UPDATE_THRESHOLD) : 7
		const now = new Date()
		const lastUpdated = new Date(obj.updatedAt)
		const diff = now.getTime() - lastUpdated.getTime()
		const diffDays = diff / (1000 * 3600 * 24)
		if (diffDays < threshold) {
			return true
		}
		return false
	}

	/**
	 * Get genres from a specific selector.
	 * @param {cheeriom.Cheerio} dom the cheerio object to extract from
	 * @param {string} selector the selector to extract from
	 * @returns {cheerio.Cheerio<cheerio.Element>[]} the genres from the selector
	 */
	getGenresFromHtml(dom: cheerio.CheerioAPI, selector: string): cheerio.Cheerio<Element>[] {
		return dom(selector)
			.toArray()
			.map((element) => dom(element)) as cheerio.Cheerio<Element>[]
	}

	/**
	 * Regex to return just the ASIN from the given URL
	 * @param {string} url string to extract ASIN from
	 * @returns {string} ASIN.
	 */
	getAsinFromUrl(url: string): string | undefined {
		return baseAsin10Regex.exec(url)?.[0]
	}

	/**
	 * Regex to return just the 11 digit ASIN from the given URL
	 * @param {string} url string to extract ASIN from
	 * @returns {string} ASIN.
	 */
	getGenreAsinFromUrl(url: string): string | undefined {
		return url.match(asin11Regex)?.[0]
	}

	/**
	 * Combine the given array of string parameters into a single string.
	 * @param {string[]} params the array of string parameters to combine
	 * @returns {string} the combined string
	 */
	getParamString(params: string[]): string {
		return params.slice(0, -1).join(',') + '&' + params.slice(-1)
	}

	/**
	 * Sort an objects keys alphabetically.
	 * @param {object} data the object to sort
	 * @returns the sorted object
	 */
	sortObjectByKeys(data: object) {
		const obj = data as Record<string, unknown>
		return Object.keys(data)
			.sort((a, b) => a.localeCompare(b))
			.reduce((r, k) => Object.assign(r, { [k]: obj[k] }), {})
	}
}

export default SharedHelper
