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

	getDescription(dom: cheerio.CheerioAPI): string {
		const description = dom('div.bc-expander-content').children().text()
		return htmlToText(description, { wordwrap: false })
	}

	getImage(dom: cheerio.CheerioAPI): string {
		try {
			return dom('img.author-image-outline')[0].attribs.src.replace(
				'__01_SX120_CR0,0,120,120__.',
				''
			)
		} catch (error) {
			return ''
		}
	}

	getName(dom: cheerio.CheerioAPI): string {
		try {
			const html = dom('h1.bc-text-bold')[0].children[0]
			const name = html as unknown as Text
			return name.data.trim()
		} catch (error) {
			throw new Error(`No author name found for ASIN: ${this.asin}`)
		}
	}

	/**
	 * Parses fetched HTML page to extract genres and series'
	 * @param {JSDOM} dom the fetched dom object
	 * @returns {HtmlBook} genre and series.
	 */
	async parseResponse(dom: cheerio.CheerioAPI | undefined): Promise<AuthorProfile> {
		// Base undefined check
		if (!dom) {
			throw new Error('No response from HTML')
		}

		// Description
		const description = this.getDescription(dom)
		// Genres
		const genres = this.helper.collectGenres(
			this.asin,
			this.helper.getGenresFromHtml(dom, 'div.contentPositionClass div.bc-box a.bc-color-link'),
			'genre'
		)
		// Image
		const image = this.getImage(dom)
		// Name
		const name = this.getName(dom)

		// Object to return
		const author: AuthorProfile = {
			asin: this.asin,
			description,
			genres,
			image,
			name
		}

		return author
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
