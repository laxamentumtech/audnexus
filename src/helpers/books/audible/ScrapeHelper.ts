import * as cheerio from 'cheerio'

import { Genre } from '#config/typing/audible'
import { HtmlBook } from '#config/typing/books'
import fetch from '#helpers/fetchPlus'
import SharedHelper from '#helpers/shared'

class ScrapeHelper {
	asin: string
	helper: SharedHelper
	reqUrl: string
	constructor(asin: string) {
		this.asin = asin
		this.helper = new SharedHelper()
		const baseDomain = 'https://www.audible.com'
		const baseUrl = 'pd'
		this.reqUrl = this.helper.buildUrl(asin, baseDomain, baseUrl)
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
				const message = `An error has occured while scraping HTML ${error.status}: ${this.reqUrl}`
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

		const genres = dom('li.categoriesLabel a')
			.toArray()
			.map((element) => dom(element))

		const tags = dom('div.bc-chip-group a')
			.toArray()
			.map((element) => dom(element))

		const returnJson = {
			genres: Array<Genre>(genres.length + tags.length)
		} as HtmlBook

		// Combine genres and tags
		if (genres.length) {
			let genreArr = this.helper.collectGenres(this.asin, genres, 'genre')
			// Tags.
			if (tags.length) {
				const tagArr = this.helper.collectGenres(this.asin, tags, 'tag')
				genreArr = tagArr?.length ? genreArr?.concat(tagArr) : genreArr
			}
			returnJson.genres = genreArr
		}

		return returnJson
	}
}

export default ScrapeHelper
