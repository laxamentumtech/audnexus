import { FastifyRedis } from '@fastify/redis'
import type { FastifyBaseLogger } from 'fastify'

import { BookDocument } from '#config/models/Book'
import { ApiQueryString } from '#config/types'
import PaprAudibleBookHelper from '#helpers/database/papr/audible/PaprAudibleBookHelper'
import RedisHelper from '#helpers/database/redis/RedisHelper'

export default class BookDeleteHelper {
	asin: string
	paprHelper: PaprAudibleBookHelper
	redisHelper: RedisHelper
	originalBook: BookDocument | null = null
	constructor(
		asin: string,
		options: ApiQueryString,
		redis: FastifyRedis | null,
		logger?: FastifyBaseLogger
	) {
		this.asin = asin
		this.paprHelper = new PaprAudibleBookHelper(this.asin, options, logger)
		this.redisHelper = new RedisHelper(redis, 'book', this.asin, options.region, logger)
	}

	async getBookFromPapr(): Promise<BookDocument | null> {
		return (await this.paprHelper.findOne()).data
	}

	/**
	 * Actions to run when a deletion is requested
	 */
	async deleteActions() {
		// 1. Delete the book from cache
		await this.redisHelper.deleteOne()

		// 2. Delete the book from DB
		return (await this.paprHelper.delete()).modified
	}

	/**
	 * Main handler for the book delete route
	 */
	async handler() {
		this.originalBook = await this.getBookFromPapr()

		// If the book is already present
		if (this.originalBook) {
			return this.deleteActions()
		}

		// If the book is not present
		return false
	}
}
