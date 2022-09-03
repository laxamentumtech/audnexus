import type { CheerioAPI } from 'cheerio'

import { AudibleProduct } from '#config/typing/audible'
import { ApiBook, Book, HtmlBook } from '#config/typing/books'
import { isBook } from '#config/typing/checkers'
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
	 * Fetch book from API and assign to class
	 */
	async fetchApiBook() {
		const apiResponse = this.apiHelper.fetchBook()
		try {
			this.apiResponse = await apiResponse
			// Set the helper data
			this.apiHelper.inputJson = this.apiResponse.product
		} catch (err) {
			throw new Error(`Error occured while fetching data from API: ${err}`)
		}
	}

	/**
	 * Fetch book from scraper and assign to class
	 */
	async fetchScraperBook() {
		const scraperResponse = this.scrapeHelper.fetchBook()
		try {
			this.scraperResponse = await scraperResponse
		} catch (err) {
			throw new Error(`Error occured while fetching data from scraper: ${err}`)
		}
	}

	/**
	 * Parse API response and assign to class
	 */
	async parseApiResponse() {
		const apiParsed = this.apiHelper.parseResponse(this.apiResponse)
		try {
			this.apiParsed = await apiParsed
		} catch (err) {
			throw new Error(`Error occured while parsing data from API: ${err}`)
		}
	}

	/**
	 * Parse scraper response and assign to class
	 */
	async parseScraperResponse() {
		const scraperParsed = this.scrapeHelper.parseResponse(this.scraperResponse)
		try {
			this.scraperParsed = await scraperParsed
		} catch (err) {
			throw new Error(`Error occured while parsing data from scraper: ${err}`)
		}
	}

	/**
	 * Sets genres key in returned json if it exists
	 */
	async includeGenres(): Promise<Book> {
		if (this.scraperParsed?.genres?.length) {
			const sortedObject = this.sharedHelper.sortObjectByKeys({
				...this.apiParsed,
				...this.scraperParsed
			})
			if (isBook(sortedObject)) return sortedObject
			throw new Error(`Error occured while sorting book json: ${this.asin}`)
		}
		return this.apiParsed as Book
	}

	/**
	 * Call fetch and parse functions only as necessary
	 * (prefer API over scraper).
	 * Returns the result of includeGenres()
	 * @returns {Promise<Book>}
	 */
	async process(): Promise<Book> {
		// First, we want to see if we can get all the data from the API
		await this.fetchApiBook()
		// Make sure we have a valid response
		const requiredKeys = this.apiHelper.hasRequiredKeys()
		if (!requiredKeys.isValid) {
			throw new Error(`${requiredKeys.message}`)
		}
		await this.parseApiResponse()

		// Check if we need to scrape for genres
		if (!this.apiResponse.product.category_ladders.length) {
			console.debug(
				`API response has no category ladders, parsing scraper response for: ${this.asin}`
			)
			await this.fetchScraperBook()
			await this.parseScraperResponse()
		}

		// Return object with genres attached if it exists
		return this.includeGenres()
	}
}

export default StitchHelper
