import { FastifyRedis } from '@fastify/redis'

import { ChapterDocument } from '#config/models/Chapter'
import { ApiChapter } from '#config/typing/books'
import { RequestGeneric } from '#config/typing/requests'
import ChapterHelper from '#helpers/books/audible/ChapterHelper'
import addTimestamps from '#helpers/database/addTimestamps'
import PaprAudibleChapterHelper from '#helpers/database/audible/PaprAudibleChapterHelper'
import RedisHelper from '#helpers/database/RedisHelper'
import SharedHelper from '#helpers/shared'

export default class ChapterShowHelper {
	asin: string
	chapterInternal: ApiChapter | undefined = undefined
	commonHelpers: SharedHelper
	paprHelper: PaprAudibleChapterHelper
	redisHelper: RedisHelper
	options: RequestGeneric['Querystring']
	originalChapter: ChapterDocument | null = null
	chapterHelper: ChapterHelper
	constructor(asin: string, options: RequestGeneric['Querystring'], redis: FastifyRedis | null) {
		this.asin = asin
		this.chapterHelper = new ChapterHelper(this.asin)
		this.commonHelpers = new SharedHelper()
		this.options = options
		this.paprHelper = new PaprAudibleChapterHelper(this.asin, this.options)
		this.redisHelper = new RedisHelper(redis, 'chapter', this.asin)
	}

	async getChaptersFromPapr(): Promise<ChapterDocument | null> {
		return (await this.paprHelper.findOne()).data
	}

	async getNewChapterData() {
		return this.chapterHelper.process()
	}

	async createOrUpdateChapters() {
		// Get the new chapter data
		const getNewChapterData = await this.getNewChapterData()
		// If the chapter is not found
		if (!getNewChapterData) return undefined
		// Place the new chapter data into the papr helper
		this.paprHelper.setChapterData(getNewChapterData)
		// Create or update the chapter
		const chapterToReturn = await this.paprHelper.createOrUpdate()
		// Update or create the chapter in cache
		await this.redisHelper.findOrCreate(chapterToReturn.data)
		// Return the chapter
		return chapterToReturn
	}

	/**
	 * Check if the chapter is updated recently by comparing the timestamps of updatedAt
	 */
	isUpdatedRecently() {
		if (!this.originalChapter) {
			return false
		}
		return this.commonHelpers.checkIfRecentlyUpdated(this.originalChapter)
	}

	/**
	 * Update the timestamps of the chapter when they are missing
	 */
	async updateChapterTimestamps(): Promise<ApiChapter> {
		// Return if not present or already has timestamps
		if (!this.originalChapter || this.originalChapter.createdAt)
			return (await this.paprHelper.findOneWithProjection()).data

		// Add timestamps
		this.paprHelper.chapterData = addTimestamps(this.originalChapter) as ChapterDocument
		// Update chapter in DB
		try {
			this.chapterInternal = (await this.paprHelper.update()).data
		} catch (err) {
			throw new Error(`An error occurred while adding timestamps to chapter ${this.asin} in the DB`)
		}
		return this.chapterInternal
	}

	/**
	 * Actions to run when an update is requested
	 */
	async updateActions(): Promise<ApiChapter | undefined> {
		// 1. Check if it is updated recently
		if (this.isUpdatedRecently()) return this.originalChapter as ApiChapter

		// 2. Get the new chapter and create or update it
		const chapterToReturn = await this.createOrUpdateChapters()
		// If the chapter is not found
		if (!chapterToReturn) return undefined

		// 3. Update chapter in cache
		if (chapterToReturn.modified) {
			this.redisHelper.setOne(chapterToReturn.data)
		}

		// 4. Return the chapter
		return chapterToReturn.data
	}

	/**
	 * Main handler for the chapter show route
	 */
	async handler() {
		this.originalChapter = await this.getChaptersFromPapr()

		// If the chapter is already present
		if (this.originalChapter) {
			// If an update is requested
			if (this.options.update === '1') {
				return this.updateActions()
			}
			// 1. Make sure it has timestamps
			await this.updateChapterTimestamps()
			// 2. Check it it is cached
			const redisChapter = await this.redisHelper.findOrCreate(this.originalChapter)
			if (redisChapter) return redisChapter as ApiChapter
			// 3. Return the chapter from DB
			return this.originalChapter as ApiChapter
		}

		// If the chapter is not present
		// Attempt to create it in the DB
		const chapterToReturn = await this.createOrUpdateChapters()
		// If the chapter is not found
		if (!chapterToReturn) return undefined
		// Return the chapter
		return chapterToReturn.data
	}
}
