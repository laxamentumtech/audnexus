import { FastifyRedis } from '@fastify/redis'
import type { FastifyBaseLogger } from 'fastify'

import { ChapterDocument } from '#config/models/Chapter'
import { ApiQueryString } from '#config/types'
import PaprAudibleChapterHelper from '#helpers/database/papr/audible/PaprAudibleChapterHelper'
import RedisHelper from '#helpers/database/redis/RedisHelper'

export default class ChapterDeleteHelper {
	asin: string
	paprHelper: PaprAudibleChapterHelper
	redisHelper: RedisHelper
	originalChapter: ChapterDocument | null = null
	constructor(
		asin: string,
		options: ApiQueryString,
		redis: FastifyRedis | null,
		logger?: FastifyBaseLogger
	) {
		this.asin = asin
		this.paprHelper = new PaprAudibleChapterHelper(this.asin, options, logger)
		this.redisHelper = new RedisHelper(redis, 'chapter', this.asin, options.region, logger)
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
