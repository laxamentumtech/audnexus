import type { CheerioAPI } from 'cheerio'

import { AudibleProduct } from '#config/typing/audible'
import { ApiBook, Book, HtmlBook } from '#config/typing/books'
import ApiHelper from '#helpers/books/audible/ApiHelper'
import ScrapeHelper from '#helpers/books/audible/ScrapeHelper'
import SharedHelper from '#helpers/shared'

class StitchHelper {
	apiHelper: ApiHelper
	apiParsed!: ApiBook
	apiResponse!: AudibleProduct
	asin: string
	sharedHelper: SharedHelper
	scrapeHelper: ScrapeHelper
	scraperParsed: HtmlBook | undefined
	scraperResponse: CheerioAPI | undefined

	constructor(asin: string) {
		this.asin = asin
		// Set up helpers
		this.apiHelper = new ApiHelper(asin)
		this.sharedHelper = new SharedHelper()
		this.scrapeHelper = new ScrapeHelper(asin)
	}

	/**
	 * Runs fetchBook functions from api and scrape helpers
	 */
	async fetchSources() {
		const apiResponse = this.apiHelper.fetchBook()
		const scraperResponse = this.scrapeHelper.fetchBook()

		// Run fetch tasks in parallel
		try {
			this.apiResponse = await apiResponse
			// Skip scraping if API response has category ladders
			if (this.apiResponse.product.category_ladders?.length) {
				return
			}
			this.scraperResponse = await scraperResponse
		} catch (err) {
			throw new Error(`Error occured while fetching data from API or scraper: ${err}`)
		}
	}

	/**
	 * Runs parseResponse functions from api and scrape helpers
	 */
	async parseResponses() {
		const apiParsed = this.apiHelper.parseResponse(this.apiResponse)
		// Skip scraper parsing if API response has category ladders
		let scraperParsed: Promise<HtmlBook | undefined> | undefined = undefined
		if (this.scraperResponse) {
			console.debug(
				`API response has no category ladders, parsing scraper response for: ${this.asin}`
			)
			scraperParsed = this.scrapeHelper.parseResponse(this.scraperResponse)
		}

		// Run parse tasks in parallel
		try {
			this.apiParsed = await apiParsed
			// Also create the partial json for genre use
			this.scraperParsed = scraperParsed ? await scraperParsed : undefined
		} catch (err) {
			throw new Error(`Error occured while parsing data from API or scraper: ${err}`)
		}
	}

	/**
	 * Sets genres key in returned json if it exists
	 */
	async includeGenres(): Promise<Book> {
		if (this.scraperParsed?.genres?.length) {
			const sortedObject = this.sharedHelper.sortBookData({
				...this.apiParsed,
				...this.scraperParsed
			})
			return sortedObject
		}
		return this.apiParsed as Book
	}

	/**
	 * Call functions in the class to parse final book JSON
	 * @returns {Promise<Book>}
	 */
	async process(): Promise<Book> {
		// Wait in order
		await this.fetchSources()
		await this.parseResponses()

		// Return object with genres attached if it exists
		return this.includeGenres()
	}
}

export default StitchHelper
