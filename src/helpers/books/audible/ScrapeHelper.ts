import * as cheerio from 'cheerio'
import { htmlToText } from 'html-to-text'
import originalFetch from 'isomorphic-fetch'

import { Genre } from '#config/typing/audible'
import { HtmlBook } from '#config/typing/books'
import SharedHelper from '#helpers/shared'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetch = require('fetch-retry')(originalFetch)

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
	 * Checks the presence of genres on html page and formats them into JSON
	 * @param {NodeListOf<Element>} genres selected source from categoriesLabel
	 * @returns {Genre[]}
	 */
	collectGenres(genres: cheerio.Cheerio<cheerio.Element>[], type: string): Genre[] | undefined {
		// Check and label each genre
		const genreArr: Genre[] | undefined = genres.map((genre, index) => {
			let thisGenre = {} as Genre
			// Only proceed if there's an ID to use
			if (genre.attr('href')) {
				const href = genre.attr('href')
				const asin = href ? this.helper.getGenreAsinFromUrl(href) : undefined
				// Verify existence of name and valid ID
				if (genre.text() && asin) {
					const cleanedName = htmlToText(genre.text(), { wordwrap: false })
					thisGenre = {
						asin: asin,
						name: cleanedName,
						type: type
					}
				}
				return thisGenre
			} else {
				console.log(`Genre ${index} asin not available on: ${this.asin}`)
			}
			return undefined
		}) as Genre[]

		return genreArr
	}

	/**
	 * Fetches the html page and checks it's response
	 * @returns {Promise<cheerio.CheerioAPI | undefined>} return text from the html page
	 */
	async fetchBook(): Promise<cheerio.CheerioAPI | undefined> {
		const response = await fetch(this.reqUrl)
		if (!response.ok) {
			const message = `An error has occured while scraping HTML ${response.status}: ${this.reqUrl}`
			if (response.status !== 404) {
				console.log(message)
			}
			return undefined
		} else {
			const text = await response.text()
			return cheerio.load(text)
		}
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
			let genreArr = this.collectGenres(genres, 'genre')
			// Tags.
			if (tags.length) {
				const tagArr = this.collectGenres(tags, 'tag')
				genreArr = tagArr?.length ? genreArr?.concat(tagArr) : genreArr
			}
			returnJson.genres = genreArr
		}

		return returnJson
	}
}

export default ScrapeHelper
