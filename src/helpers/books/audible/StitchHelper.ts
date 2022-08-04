import type { CheerioAPI } from 'cheerio'

import { AudibleProduct } from '#config/typing/audible'
import { ApiBook, Book, HtmlBook } from '#config/typing/books'
import ApiHelper from '#helpers/books/audible/ApiHelper'
import ScrapeHelper from '#helpers/books/audible/ScrapeHelper'

class StitchHelper {
	apiHelper: ApiHelper
	apiParsed: ApiBook | undefined
	apiResponse: AudibleProduct | undefined
	asin: string
	scrapeHelper: ScrapeHelper
	scraperParsed: HtmlBook | undefined
	scraperResponse: CheerioAPI | undefined

	constructor(asin: string) {
		this.asin = asin
		// Set up helpers
		this.apiHelper = new ApiHelper(asin)
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
		const scraperParsed = this.scrapeHelper.parseResponse(this.scraperResponse)

		// Run parse tasks in parallel
		try {
			this.apiParsed = await apiParsed
			// Also create the partial json for genre use
			this.scraperParsed = await scraperParsed
		} catch (err) {
			throw new Error(`Error occured while parsing data from API or scraper: ${err}`)
		}
	}

	/**
	 * Sets genres key in returned json if it exists
	 */
	async includeGenres(): Promise<Book> {
		if (this.scraperParsed && this.scraperParsed.genres?.length) {
			return { ...this.apiParsed, ...this.scraperParsed } as Book
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

		const stitchedGenres = await this.includeGenres()
		const bookJson: Book = stitchedGenres
		return bookJson
	}
}

export default StitchHelper
