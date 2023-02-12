import * as cheerio from 'cheerio'
import { htmlToText } from 'html-to-text'

import { ApiAuthorProfile, ApiAuthorProfileSchema } from '#config/types'
import fetch from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'
import {
	ErrorMessageHTTPFetch,
	ErrorMessageNoResponse,
	ErrorMessageNotFound,
	ErrorMessageRequiredKey
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
	async parseResponse(dom: cheerio.CheerioAPI | undefined): Promise<ApiAuthorProfile> {
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

		// Parse response with zod
		const response = ApiAuthorProfileSchema.safeParse({
			asin: this.asin,
			description,
			genres,
			image,
			name,
			region: this.region
		})
		// Handle error if response is not valid
		if (!response.success) {
			// Get the key 'path' from the first issue
			const issuesPath = response.error.issues[0].path
			// Get the last key from the path, which is the key that is missing
			const key = issuesPath[issuesPath.length - 1]
			// Throw error with the missing key
			throw new Error(ErrorMessageRequiredKey(this.asin, String(key), 'exist'))
		}

		// Return the parsed response data if it is valid
		return response.data
	}

	/**
	 * Call functions in the class to parse final book JSON
	 * @returns {Promise<ApiAuthorProfile>}
	 */
	async process(): Promise<ApiAuthorProfile> {
		const authorResponse = await this.fetchAuthor()

		return this.parseResponse(authorResponse)
	}
}

export default ScrapeHelper
