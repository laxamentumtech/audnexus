import * as cheerio from 'cheerio'
import { htmlToText } from 'html-to-text'

import { AuthorProfile } from '#config/typing/people'
import fetch from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'
import {
	ErrorMessageHTTPFetch,
	ErrorMessageNoResponse,
	ErrorMessageNotFound
} from '#static/messages'
import { regions } from '#static/regions'

class ScrapeHelper {
	asin: string
	helper: SharedHelper
	reqUrl: string
	region: string
	constructor(asin: string, region: string) {
		this.asin = asin
		this.region = region
		this.helper = new SharedHelper()
		const baseDomain = 'https://www.audible'
		const regionTLD = regions[region].tld
		const baseUrl = 'author'
		this.reqUrl = this.helper.buildUrl(asin, baseDomain, regionTLD, baseUrl)
	}

	/**
	 * Fetches the html page and checks it's response
	 * @returns {Promise<cheerio.CheerioAPI | undefined>} return text from the html page
	 */
	async fetchAuthor(): Promise<cheerio.CheerioAPI> {
		return fetch(this.reqUrl)
			.then(async (response) => {
				const text = await response.data
				return cheerio.load(text)
			})
			.catch((error) => {
				throw new Error(ErrorMessageHTTPFetch(this.asin, error.status, 'Audible HTML'))
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
			throw new Error(ErrorMessageNotFound(this.asin, 'author name'))
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
			throw new Error(ErrorMessageNoResponse(this.asin, 'HTML'))
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
			name,
			region: this.region
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
