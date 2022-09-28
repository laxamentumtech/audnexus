import * as cheerio from 'cheerio'
import { htmlToText } from 'html-to-text'
import lodash from 'lodash'

import { ApiGenre } from '#config/typing/books'
import { PaprDocument } from '#config/typing/papr'
import { ParsedObject } from '#config/typing/unions'
import { NoticeGenreNotAvailable } from '#static/messages'
import { regions } from '#static/regions'

class SharedHelper {
	asin10Regex = /^(B[\dA-Z]{9}|\d{9}(X|\d))$/
	asin11Regex = /(?=.\d)[A-Z\d]{11}/
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
		const argArr = [FQDN, baseUrl, ASIN, params]
		const reqUrl = argArr.join('/')
		return reqUrl
	}

	/**
	 * Checks asin length and format to verify it's valid
	 * @param {string} asin 10 character identifier
	 * @returns {boolean}
	 */
	checkAsinValidity(asin: string): boolean {
		// First things first, check length
		if (asin.length !== 10) {
			return false
		}

		if (asin.match(this.asin10Regex)) {
			return true
		}
		return false
	}

	/**
	 * Checks whether the input data are identical
	 * @param {ParsedObject} original
	 * @param {ParsedObject} updated
	 * @returns {boolean}
	 */
	checkDataEquality(original: ParsedObject, updated: ParsedObject): boolean {
		if (lodash.isEqual(original, updated)) {
			return true
		}
		return false
	}

	/**
	 * Checks if the object was updated in the last 24 hours
	 * @param obj object to check
	 * @returns {boolean} true if updated in last 24 hours, false otherwise
	 */
	checkIfRecentlyUpdated(obj: PaprDocument): boolean {
		const now = new Date()
		const lastUpdated = new Date(obj.updatedAt)
		const diff = now.getTime() - lastUpdated.getTime()
		const diffDays = diff / (1000 * 3600 * 24)
		if (diffDays < 1) {
			return true
		}
		return false
	}

	/**
	 * Checks the presence of genres on html page and formats them into JSON.
	 * @param {string} asin the ASIN of the book or author
	 * @param {NodeListOf<Element>} genres selected source from categoriesLabel
	 * @param {string} type the type to assign to the returned objects
	 * @returns {ApiGenre[]}
	 */
	collectGenres(
		asin: string,
		genres: cheerio.Cheerio<cheerio.Element>[],
		type: string
	): ApiGenre[] {
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
						const thisGenre: ApiGenre = {
							asin: catAsin,
							name: cleanedName,
							type: type
						}
						return thisGenre
					}
				} else {
					console.log(NoticeGenreNotAvailable(asin, index))
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
	 * Validate the region code.
	 * @param {string} region the region code to validate
	 */
	isValidRegion(region: string): boolean {
		const regionTLD = regions[region]?.tld
		if (!regionTLD) {
			return false
		}
		return true
	}

	/**
	 * Get genres from a specific selector.
	 * @param {cheeriom.Cheerio} dom the cheerio object to extract from
	 * @param {string} selector the selector to extract from
	 * @returns {cheerio.Cheerio<cheerio.Element>[]} the genres from the selector
	 */
	getGenresFromHtml(dom: cheerio.CheerioAPI, selector: string): cheerio.Cheerio<cheerio.Element>[] {
		return dom(selector)
			.toArray()
			.map((element) => dom(element)) as cheerio.Cheerio<cheerio.Element>[]
	}

	/**
	 * Regex to return just the ASIN from the given URL
	 * @param {string} url string to extract ASIN from
	 * @returns {string} ASIN.
	 */
	getGenreAsinFromUrl(url: string): string | undefined {
		return url.match(this.asin11Regex)?.[0]
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
	sortObjectByKeys(data: ParsedObject) {
		const obj = data as unknown as { [key: string]: unknown }
		return Object.keys(data)
			.sort()
			.reduce((r, k) => Object.assign(r, { [k]: obj[k] }), {}) as ParsedObject
	}
}

export default SharedHelper
