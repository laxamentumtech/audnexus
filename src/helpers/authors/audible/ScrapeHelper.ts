import * as cheerio from 'cheerio'
import { htmlToText } from 'html-to-text'

import { ApiAuthorOnBook, ApiAuthorProfile, ApiAuthorProfileSchema } from '#config/types'
import fetch from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'
import {
	ErrorMessageHTTPFetch,
	ErrorMessageNoResponse,
	ErrorMessageNotFound,
	ErrorMessageRegion
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
		// We need to override the base country to get the correct author page
		const params = 'ipRedirectOverride=true&overrideBaseCountry=true'
		this.reqUrl = this.helper.buildUrl(asin, baseDomain, regionTLD, baseUrl, params)
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
		let name: string
		// First try to get valid author text
		try {
			const html = dom(
				'h1.bc-heading.bc-color-base.bc-size-extra-large.bc-text-secondary.bc-text-bold'
			)
				.first()
				.text()
			name = html.trim()
		} catch (error) {
			throw new Error(ErrorMessageNotFound(this.asin, 'author name'))
		}

		// Method might retrieve header text instead of valid author
		if (name === 'Showing titles\n in All Categories') {
			throw new Error(ErrorMessageRegion(this.asin, this.region))
		}
		return name
	}

	/**
	 * Get similar authors
	 * @param {cheerio.CheerioAPI} dom the fetched dom object
	 * @returns {ApiAuthorOnBook[]} similar authors.
	 */
	getSimilarAuthors(dom: cheerio.CheerioAPI): ApiAuthorOnBook[] | undefined {
		try {
			// Get similar authors section
			const similarSection = dom(
				'div.bc-col-responsive.bc-pub-max-width-large.bc-col-3.bc-col-offset-0'
			)
			// Get similar authors list
			const similarItems = similarSection.children('a.bc-link.bc-color-link')
			// Map similar authors to object
			const similarAuthors = similarItems
				.map((i, el) => {
					return {
						asin: this.helper.getAsinFromUrl(el.attribs.href),
						name: dom(el).find('h3').text()
					}
				})
				.get()
			return similarAuthors
		} catch (error) {
			return undefined
		}
	}

	/**
	 * Sort similar authors by name
	 * @param {ApiAuthorOnBook[]} similarAuthors the fetched dom object
	 * @returns {ApiAuthorOnBook[]} sorted similar authors.
	 */
	sortSimilarAuthors(similarAuthors: ApiAuthorOnBook[]): ApiAuthorOnBook[] {
		return similarAuthors.sort((a, b) => a.name.localeCompare(b.name))
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

		// Similar authors
		const similarAuthors = this.getSimilarAuthors(dom)
		// Sort similar authors by name
		const similar = similarAuthors ? this.sortSimilarAuthors(similarAuthors) : undefined

		// Parse response with zod
		const response = ApiAuthorProfileSchema.safeParse({
			asin: this.asin,
			description,
			genres,
			image,
			name,
			region: this.region,
			similar
		})
		// Handle error if response is not valid
		if (!response.success) {
			// If the key is content_delivery_type, then the item is not available in the region
			throw new Error(ErrorMessageRegion(this.asin, this.region))
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
