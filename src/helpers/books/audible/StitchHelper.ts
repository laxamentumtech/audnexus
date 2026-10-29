import type { CheerioAPI } from 'cheerio'
import type { FastifyBaseLogger } from 'fastify'

import type { BookObservation } from '#config/bookHistory'
import { getPerformanceConfig } from '#config/performance'
import { ApiBook, ApiBookSchema, AudibleProduct, HtmlBook } from '#config/types'
import ApiHelper from '#helpers/books/audible/ApiHelper'
import { composeTimestamps, withGenresField } from '#helpers/books/audible/BookObservation'
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
	private captureHistory: boolean
	private htmlReceivedAt: Date | undefined
	private historyHtmlGenres: HtmlBook['genres'] | undefined
	logger?: FastifyBaseLogger

	constructor(
		asin: string,
		region: string,
		logger?: FastifyBaseLogger,
		captureHistory: boolean = false
	) {
		this.asin = asin
		this.logger = logger
		this.captureHistory = captureHistory
		// Set up helpers
		this.apiHelper = new ApiHelper(asin, region, logger, captureHistory)
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
			throw new Error(getErrorMessage(error), { cause: error })
		}
	}

	/**
	 * Fetch book from scraper and assign to class
	 */
	async fetchScraperBook() {
		const scraperResponse = this.scrapeHelper.fetchBook()
		try {
			this.scraperResponse = await scraperResponse
			if (this.captureHistory) this.htmlReceivedAt = new Date()
		} catch (error) {
			// Preserve custom errors with statusCode (NotFoundError, BadRequestError)
			if (error instanceof Error && 'statusCode' in error) {
				throw error
			}
			throw new Error(getErrorMessage(error), { cause: error })
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
			throw new Error(getErrorMessage(error), { cause: error })
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
			throw new Error(getErrorMessage(error), { cause: error })
		}
	}

	/**
	 * Sets genres key in returned json if it exists
	 */
	async includeGenres(): Promise<ApiBook> {
		if (this.scraperParsed?.genres?.length) {
			if (this.captureHistory) this.historyHtmlGenres = this.scraperParsed.genres
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
	 * Get the stitched history observation, or undefined when collection is
	 * disabled or the API fetch itself produced no observation. HTML genre
	 * evidence is attached only when the scraper actually supplied genres;
	 * the observation time is the final required successful response receipt
	 * time (API time unless accepted HTML genres contributed, otherwise
	 * HTML receipt time).
	 */
	getHistoryObservation(): BookObservation | undefined {
		const apiObservation = this.apiHelper.getHistoryObservation()
		if (!this.captureHistory || !apiObservation) return apiObservation
		const fields = this.historyHtmlGenres
			? withGenresField(apiObservation.fields, this.historyHtmlGenres, 'audible_html')
			: apiObservation.fields
		return {
			...apiObservation,
			...composeTimestamps(apiObservation.apiReceivedAt, this.htmlReceivedAt),
			fields
		}
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
