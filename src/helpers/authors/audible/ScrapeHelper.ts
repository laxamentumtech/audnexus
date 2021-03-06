import * as cheerio from 'cheerio'
import { htmlToText } from 'html-to-text'
import originalFetch from 'isomorphic-fetch'

import { Genre } from '#config/typing/audible'
import { AuthorProfile } from '#config/typing/people'
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
		const baseUrl = 'author'
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
			if (genre.attr('href')) {
				const href = genre.attr('href')
				const asin = href ? this.helper.getAsinFromUrl(href) : undefined
				if (genre.text() && asin) {
					thisGenre = {
						asin: asin,
						name: genre.children().text(),
						type: type
					}
				}
				return thisGenre
			} else {
				console.debug(`Genre ${index} asin not available on: ${this.asin}`)
			}
			return undefined
		}) as Genre[]

		return genreArr
	}

	/**
	 * Fetches the html page and checks it's response
	 * @returns {Promise<cheerio.CheerioAPI | undefined>} return text from the html page
	 */
	async fetchAuthor(): Promise<cheerio.CheerioAPI> {
		const response = await fetch(this.reqUrl)
		if (!response.ok) {
			const message = `An error occured while fetching Audible HTML. Response: ${response.status}, ASIN: ${this.asin}`
			throw new Error(message)
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
	async parseResponse($: cheerio.CheerioAPI | undefined): Promise<AuthorProfile> {
		// Base undefined check
		if (!$) {
			throw new Error('No response from HTML')
		}

		const returnJson = {} as AuthorProfile

		// ID
		returnJson.asin = this.asin

		// Bio.
		try {
			returnJson.description = htmlToText($('div.bc-expander-content').children().text(), {
				wordwrap: false
			})
		} catch (err) {
			console.debug(`Bio not available on: ${this.asin}`)
		}

		// Genres.
		try {
			const genres = $('div.contentPositionClass div.bc-box a.bc-color-link')
				.toArray()
				.map((element) => $(element))
			returnJson.genres = this.collectGenres(genres, 'genre')
		} catch (err) {
			console.debug(`Genres not available on: ${this.asin}`)
		}

		// Image.
		try {
			// We'll ask for a *slightly* larger than postage-stamp-sized pic...
			returnJson.image = $('img.author-image-outline')[0].attribs.src.replace(
				'__01_SX120_CR0,0,120,120__.',
				''
			)
		} catch (err) {
			// continue regardless of error
		}

		// Name.
		try {
			// Workaround data error: https://github.com/cheeriojs/cheerio/issues/1854
			const name = $('h1.bc-text-bold')[0].children[0] as any
			if (typeof name.data === 'string') {
				returnJson.name = name.data
			}
		} catch (err) {
			throw new Error('Author name not available')
		}

		return returnJson
	}

	/**
	 * Call functions in the class to parse final book JSON
	 * @returns {Promise<AuthorProfile>}
	 */
	async process(): Promise<AuthorProfile> {
		const authorResponse = await this.fetchAuthor()

		return this.parseResponse(authorResponse)
	}
}

export default ScrapeHelper
