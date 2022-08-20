import { FastifyRedis } from '@fastify/redis'

import { ChapterDocument } from '#config/models/Chapter'
import PaprAudibleChapterHelper from '#helpers/database/audible/PaprAudibleChapterHelper'
import RedisHelper from '#helpers/database/RedisHelper'

export default class ChapterDeleteHelper {
	asin: string
	paprHelper: PaprAudibleChapterHelper
	redisHelper: RedisHelper
	originalChapter: ChapterDocument | null = null
	constructor(asin: string, redis: FastifyRedis | null) {
		this.asin = asin
		this.paprHelper = new PaprAudibleChapterHelper(this.asin, {
			update: undefined
		})
		this.redisHelper = new RedisHelper(redis, 'chapter', this.asin)
	}

	async getChaptersFromPapr(): Promise<ChapterDocument | null> {
		return (await this.paprHelper.findOne()).data
	}

	/**
	 * Actions to run when a deletion is requested
	 */
	async deleteActions() {
		// 1. Delete the chapter from cache
		await this.redisHelper.deleteOne()

		// 2. Delete the chapter from DB
		return (await this.paprHelper.delete()).modified
	}

	/**
	 * Main handler for the chapter delete route
	 */
	async handler() {
		this.originalChapter = await this.getChaptersFromPapr()

		// If the chapter is already present
		if (this.originalChapter) {
			return this.deleteActions()
		}

		// If the chapter is not present
		return false
	}
}
