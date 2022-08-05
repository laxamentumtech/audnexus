import * as cheerio from 'cheerio'
import { isText } from 'domhandler'
import { htmlToText } from 'html-to-text'

import { AuthorProfile } from '#config/typing/people'
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
		const baseUrl = 'author'
		this.reqUrl = this.helper.buildUrl(asin, baseDomain, baseUrl)
	}

	/**
	 * Fetches the html page and checks it's response
	 * @returns {Promise<cheerio.CheerioAPI | undefined>} return text from the html page
	 */
	async fetchAuthor(): Promise<cheerio.CheerioAPI> {
		return fetch(this.reqUrl)
			.then(async (response) => {
				const text = await response.text()
				return cheerio.load(text)
			})
			.catch((error) => {
				const message = `An error occured while fetching Audible HTML. Response: ${error.status}, ASIN: ${this.asin}`
				throw new Error(message)
			})
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
			returnJson.genres = this.helper.collectGenres(this.asin, genres, 'genre')
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
			const name = $('h1.bc-text-bold')[0].children[0]
			if (isText(name)) {
				returnJson.name = name.data.trim()
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
