import * as cheerio from 'cheerio'

import { HtmlBook } from '#config/typing/books'
import fetch from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'
import { ErrorMessageHTTPFetch } from '#static/messages'
import { regions } from '#static/regions'

class ScrapeHelper {
	asin: string
	helper: SharedHelper
	reqUrl: string
	constructor(asin: string, region: string) {
		this.asin = asin
		this.helper = new SharedHelper()
		const baseDomain = 'https://www.audible'
		const regionTLD = regions[region].tld
		const baseUrl = 'pd'
		this.reqUrl = this.helper.buildUrl(asin, baseDomain, regionTLD, baseUrl)
	}

	/**
	 * Fetches the html page and checks it's response
	 * @returns {Promise<cheerio.CheerioAPI | undefined>} return text from the html page
	 */
	async fetchBook(): Promise<cheerio.CheerioAPI | undefined> {
		return fetch(this.reqUrl)
			.then(async (response) => {
				const text = await response.text()
				return cheerio.load(text)
			})
			.catch((error) => {
				const message = ErrorMessageHTTPFetch(this.asin, error.status, 'HTML')
				if (error.status !== 404) {
					console.log(message)
				}
				return undefined
			})
	}

	/**
	 * Parses fetched HTML page to extract genres and series'
	 * @param {JSDOM} dom the fetched dom object
	 * @returns {HtmlBook} genre and series.
	 */
	async parseResponse(dom: cheerio.CheerioAPI | undefined): Promise<HtmlBook | undefined> {
		// If there's no dom, don't interrupt the other module cycles
		if (!dom) {
			return undefined
		}

		// Genres
		const genres = this.helper.collectGenres(
			this.asin,
			this.helper.getGenresFromHtml(dom, 'li.categoriesLabel a'),
			'genre'
		)
		// Tags
		const tags = this.helper.collectGenres(
			this.asin,
			this.helper.getGenresFromHtml(dom, 'div.bc-chip-group a'),
			'tag'
		)
		// Object to return
		const genresObject: HtmlBook = {
			genres: [...genres, ...tags]
		}
		// Return the object if there's at least one genre
		if (genresObject.genres.length) return genresObject

		return undefined
	}
}

export default ScrapeHelper
