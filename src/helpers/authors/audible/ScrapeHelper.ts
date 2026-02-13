import * as cheerio from 'cheerio'
import type { FastifyBaseLogger } from 'fastify'
import { htmlToText } from 'html-to-text'

import { ApiAuthorOnBook, ApiAuthorProfile, ApiAuthorProfileSchema, ApiGenre } from '#config/types'
import { ContentTypeMismatchError, NotFoundError } from '#helpers/errors/ApiErrors'
import cleanupDescription from '#helpers/utils/cleanupDescription'
import fetch from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'
import {
	ErrorMessageContentTypeMismatch,
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
	logger?: FastifyBaseLogger
	constructor(asin: string, region: string, logger?: FastifyBaseLogger) {
		this.asin = asin
		this.region = region
		this.logger = logger
		this.helper = new SharedHelper(logger)
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
		} catch {
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
		} catch {
			throw new NotFoundError(ErrorMessageNotFound(this.asin, 'author name'))
		}

		// Method might retrieve header text instead of valid author
		if (name === 'Showing titles\n in All Categories') {
			throw new NotFoundError(ErrorMessageRegion(this.asin, this.region), {
				asin: this.asin,
				code: 'REGION_UNAVAILABLE'
			})
		}
		return name
	}

	/**
	 * Get similar authors
	 * @param {cheerio.CheerioAPI} dom the fetched dom object
	 * @returns {ApiAuthorOnBook[]} similar authors.
	 */
	getSimilarAuthors(dom: cheerio.CheerioAPI): ApiAuthorOnBook[] {
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
		} catch {
			return []
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
	 * Detect if the page is a book page instead of an author page
	 * Book pages have elements like buy buttons, sample buttons, or book-specific structures
	 * @param {cheerio.CheerioAPI} dom the fetched dom object
	 * @returns {boolean} true if the page is likely a book page
	 */
	isBookPage(dom: cheerio.CheerioAPI): boolean {
		// Check for book-specific elements:
		// 1. Buy/Add to Cart buttons (book pages have purchase buttons, author pages don't)
		const hasBuyButton = dom('[data-testid="buy-button"]').length > 0
		// 2. Sample/Listen buttons (book pages have audio samples)
		const hasSampleButton =
			dom('button:contains("Sample")').length > 0 ||
			dom('[data-testid="sample-button"]').length > 0 ||
			dom('.bc-button-text:contains("Sample")').length > 0
		// 3. Book title structure (book pages have different title structure than author pages)
		const hasBookTitle = dom('h1.bc-heading').find('.bc-text-bold').length > 0
		// 4. Chapter list elements (books have chapter lists)
		const hasChapterList = dom('[data-testid="chapter-list"]').length > 0
		// 5. Product listener/review elements specific to books
		const hasProductListener = dom('.product-listener').length > 0

		// If any of these book-specific elements are found, it's likely a book page
		return hasBuyButton || hasSampleButton || hasBookTitle || hasChapterList || hasProductListener
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
		const description = cleanupDescription(this.getDescription(dom))
		// Genres - Author pages do not have genres (genres are per-book, not per-author)
		const genres: ApiGenre[] = []
		// Image
		const image = this.getImage(dom)
		// Name
		const name = this.getName(dom)

		// Similar authors
		const similarAuthors = this.getSimilarAuthors(dom)
		// Sort similar authors by name
		const similar = this.sortSimilarAuthors(similarAuthors)

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
			// Check if this might be a book page instead of an author page
			if (this.isBookPage(dom)) {
				throw new ContentTypeMismatchError(
					ErrorMessageContentTypeMismatch(this.asin, 'book', 'author'),
					{ asin: this.asin, requestedType: 'author', actualType: 'book' }
				)
			}
			// If not a book page, then the item is not available in the region
			throw new NotFoundError(ErrorMessageRegion(this.asin, this.region), {
				asin: this.asin,
				code: 'REGION_UNAVAILABLE'
			})
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
