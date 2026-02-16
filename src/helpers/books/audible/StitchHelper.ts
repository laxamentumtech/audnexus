import type { CheerioAPI } from 'cheerio'
import type { FastifyBaseLogger } from 'fastify'

import { getPerformanceConfig } from '#config/performance'
import { ApiBook, ApiBookSchema, AudibleProduct, HtmlBook } from '#config/types'
import ApiHelper from '#helpers/books/audible/ApiHelper'
import ScrapeHelper from '#helpers/books/audible/ScrapeHelper'
import getErrorMessage from '#helpers/utils/getErrorMessage'
import SharedHelper from '#helpers/utils/shared'
import { ErrorMessageSort, NoticeChaptersFallback } from '#static/messages'

class StitchHelper {
	apiHelper: ApiHelper
	apiParsed!: ApiBook
	apiResponse!: AudibleProduct
	asin: string
	sharedHelper: SharedHelper
	scrapeHelper: ScrapeHelper
	scraperParsed: HtmlBook | undefined
	scraperResponse: CheerioAPI | undefined
	logger?: FastifyBaseLogger

	constructor(asin: string, region: string, logger?: FastifyBaseLogger) {
		this.asin = asin
		this.logger = logger
		// Set up helpers
		this.apiHelper = new ApiHelper(asin, region, logger)
		this.sharedHelper = new SharedHelper()
		this.scrapeHelper = new ScrapeHelper(asin, region, logger)
	}

	/**
	 * Fetch book from API and assign to class
	 */
	async fetchApiBook() {
		const apiResponse = this.apiHelper.fetchBook()
		try {
			this.apiResponse = await apiResponse
			// Set the helper data
			this.apiHelper.audibleResponse = this.apiResponse.product
		} catch (error) {
			// Preserve custom errors with statusCode (NotFoundError, BadRequestError)
			if (error instanceof Error && 'statusCode' in error) {
				throw error
			}
			throw new Error(getErrorMessage(error))
		}
	}

	/**
	 * Fetch book from scraper and assign to class
	 */
	async fetchScraperBook() {
		const scraperResponse = this.scrapeHelper.fetchBook()
		try {
			this.scraperResponse = await scraperResponse
		} catch (error) {
			// Preserve custom errors with statusCode (NotFoundError, BadRequestError)
			if (error instanceof Error && 'statusCode' in error) {
				throw error
			}
			throw new Error(getErrorMessage(error))
		}
	}

	/**
	 * Parse API response and assign to class
	 */
	async parseApiResponse() {
		const apiParsed = this.apiHelper.parseResponse(this.apiResponse)
		try {
			this.apiParsed = await apiParsed
		} catch (error) {
			// Preserve custom errors with statusCode (NotFoundError, BadRequestError)
			if (error instanceof Error && 'statusCode' in error) {
				throw error
			}
			throw new Error(getErrorMessage(error))
		}
	}

	/**
	 * Parse scraper response and assign to class
	 */
	async parseScraperResponse() {
		const scraperParsed = this.scrapeHelper.parseResponse(this.scraperResponse)
		try {
			this.scraperParsed = await scraperParsed
		} catch (error) {
			// Preserve custom errors with statusCode (NotFoundError, BadRequestError)
			if (error instanceof Error && 'statusCode' in error) {
				throw error
			}
			throw new Error(getErrorMessage(error))
		}
	}

	/**
	 * Sets genres key in returned json if it exists
	 */
	async includeGenres(): Promise<ApiBook> {
		if (this.scraperParsed?.genres?.length) {
			const perfConfig = getPerformanceConfig()
			const mergedObject = {
				...this.apiParsed,
				...this.scraperParsed
			}
			const sortedObject = perfConfig.USE_SORTED_KEYS
				? this.sharedHelper.sortObjectByKeys(mergedObject)
				: mergedObject
			const parsed = ApiBookSchema.safeParse(sortedObject)
			if (parsed.success) return parsed.data
			throw new Error(ErrorMessageSort(this.asin))
		}
		return this.apiParsed
	}

	/**
	 * Call fetch and parse functions only as necessary
	 * (prefer API over scraper).
	 * Returns the result of includeGenres()
	 * @returns {Promise<ApiBook>}
	 */
	async process(): Promise<ApiBook> {
		// First, we want to see if we can get all the data from the API
		await this.fetchApiBook()
		await this.parseApiResponse()

		// Check if we need to scrape for genres
		if (!this.apiResponse.product.category_ladders.length) {
			this.logger?.debug(NoticeChaptersFallback(this.asin))
			// Fetch and parse scraper data
			await this.fetchScraperBook()
			await this.parseScraperResponse()
		}

		// Return object with genres attached if it exists
		return this.includeGenres()
	}
}

export default StitchHelper
