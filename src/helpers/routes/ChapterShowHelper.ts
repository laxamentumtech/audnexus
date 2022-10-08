import { FastifyRedis } from '@fastify/redis'

import { ChapterDocument } from '#config/models/Chapter'
import { ApiChapter } from '#config/typing/books'
import { isChapter } from '#config/typing/checkers'
import { ParsedQuerystring } from '#config/typing/requests'
import ChapterHelper from '#helpers/books/audible/ChapterHelper'
import PaprAudibleChapterHelper from '#helpers/database/papr/audible/PaprAudibleChapterHelper'
import RedisHelper from '#helpers/database/redis/RedisHelper'
import SharedHelper from '#helpers/utils/shared'
import { ErrorMessageDataType } from '#static/messages'

export default class ChapterShowHelper {
	asin: string
	chapterInternal: ApiChapter | undefined = undefined
	sharedHelper: SharedHelper
	paprHelper: PaprAudibleChapterHelper
	redisHelper: RedisHelper
	options: ParsedQuerystring
	originalChapter: ChapterDocument | null = null
	chapterHelper: ChapterHelper
	constructor(asin: string, options: ParsedQuerystring, redis: FastifyRedis | null) {
		this.asin = asin
		this.sharedHelper = new SharedHelper()
		this.options = options
		this.paprHelper = new PaprAudibleChapterHelper(this.asin, this.options)
		this.redisHelper = new RedisHelper(redis, 'chapter', this.asin, options.region)
		this.chapterHelper = new ChapterHelper(this.asin, this.options.region)
	}

	/**
	 * Get the ChapterDocument from Papr
	 */
	async getChaptersFromPapr(): Promise<ChapterDocument | null> {
		return (await this.paprHelper.findOne()).data
	}

	/**
	 * Get the chapter with projections,
	 * making sure the data is the correct type.
	 * Then, sort the data and return it.
	 */
	async getChapterWithProjection(): Promise<ApiChapter> {
		// 1. Get the chapter with projections
		const chapterToReturn = await this.paprHelper.findOneWithProjection()
		// Make sure we get a chapter type back
		if (!isChapter(chapterToReturn.data))
			throw new Error(ErrorMessageDataType(this.asin, 'Chapter'))

		// 2. Sort the object
		const sort = this.sharedHelper.sortObjectByKeys(chapterToReturn.data)
		if (isChapter(sort)) return sort

		throw new Error(ErrorMessageDataType(this.asin, 'Chapter'))
	}

	/**
	 * Run the scraper to get the chapter data
	 */
	async getNewChapterData() {
		return this.chapterHelper.process()
	}

	/**
	 * Get new chapter data and pass it to the create or update papr function.
	 * Then, set redis cache and return the chapter.
	 */
	async createOrUpdateChapters(): Promise<ApiChapter | undefined> {
		// Get the new chapter data
		const getNewChapterData = await this.getNewChapterData()

		// If the chapter is not found
		if (!getNewChapterData) return undefined

		// Place the new chapter data into the papr helper
		this.paprHelper.setChapterData(getNewChapterData)

		// Create or update the chapter
		const chapterToReturn = await this.paprHelper.createOrUpdate()
		if (!isChapter(chapterToReturn.data))
			throw new Error(ErrorMessageDataType(this.asin, 'Chapter'))

		// Geth the chapter with projections
		const data = await this.getChapterWithProjection()

		// Update or create the chapter in cache
		this.redisHelper.setOne(data)

		// Return the chapter
		return data
	}

	/**
	 * Check if the chapter is updated recently by comparing the timestamps of updatedAt
	 */
	isUpdatedRecently() {
		if (!this.originalChapter) {
			return false
		}
		return this.sharedHelper.isRecentlyUpdated(this.originalChapter)
	}

	/**
	 * Actions to run when an update is requested
	 */
	async updateActions(): Promise<ApiChapter | undefined> {
		// 1. Check if it is updated recently
		if (this.isUpdatedRecently()) return this.getChapterWithProjection()

		// 2. Create and return the chapter
		return this.createOrUpdateChapters()
	}

	/**
	 * Main handler for the chapter show route
	 */
	async handler(): Promise<ApiChapter | undefined> {
		this.originalChapter = await this.getChaptersFromPapr()

		// If the chapter is already present
		if (this.originalChapter) {
			// If an update is requested
			if (this.options.update === '1') {
				return this.updateActions()
			}

			// 1. Get the chapter with projections
			const data = await this.getChapterWithProjection()

			// 2. Check it it is cached
			const redisChapter = await this.redisHelper.findOrCreate(data)
			if (redisChapter && isChapter(redisChapter)) return redisChapter

			// 3. Return the chapter from DB
			return data
		}

		// If the chapter is not present
		return this.createOrUpdateChapters()
	}
}
