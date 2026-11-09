import { FastifyRedis } from '@fastify/redis'
import type { FastifyBaseLogger } from 'fastify'

import { isBookHistoryEnabled } from '#config/bookHistory'
import { BookDocument } from '#config/models/Book'
import { bookHistoryStore } from '#config/papr'
import { ApiQueryString } from '#config/types'
import PaprAudibleBookHelper from '#helpers/database/papr/audible/PaprAudibleBookHelper'
import RedisHelper from '#helpers/database/redis/RedisHelper'

export default class BookDeleteHelper {
	asin: string
	options: ApiQueryString
	paprHelper: PaprAudibleBookHelper
	redisHelper: RedisHelper
	originalBook: BookDocument | null = null
	logger?: FastifyBaseLogger
	constructor(
		asin: string,
		options: ApiQueryString,
		redis: FastifyRedis | null,
		logger?: FastifyBaseLogger
	) {
		this.asin = asin
		this.options = options
		this.logger = logger
		this.paprHelper = new PaprAudibleBookHelper(asin, options, logger)
		this.redisHelper = new RedisHelper(redis, 'book', asin, options.region, logger)
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
		if (isBookHistoryEnabled()) {
			// Transactional delete: identity resolution, legacy artwork
			// capture, delete by verified _id, and delete fence — history
			// state, baselines, revisions, and assets all survive.
			const result = await bookHistoryStore.deleteCurrent(this.asin, this.options.region)
			if (result.data.deletedCount === 0) return false
			// Post-commit invalidation is best-effort: the delete is durable,
			// and a cache failure must not turn a completed delete into a 500
			// (the stale cache key would otherwise be served until its TTL).
			// `log: false` — this wrapper emits the single actionable line
			// (which book, that the delete is committed); the redis-layer log
			// is suppressed so a cache failure does not emit two error lines.
			try {
				await this.redisHelper.deleteOne({ log: false })
			} catch (error) {
				this.logger?.error(
					`History cache invalidation failed for book ${this.asin} (delete is committed): ${String(error)}`
				)
			}
			return true
		}

		// Legacy only: the pre-read gates the delete (history mode's
		// `deleteCurrent` re-resolves identity in-transaction and never
		// reads it, so no read happens on that path). `deleteActions`
		// re-resolves by asin+region and does not use `originalBook` again.
		this.originalBook = await this.getBookFromPapr()
		// If the book is already present
		if (this.originalBook) {
			return this.deleteActions()
		}

		// If the book is not present
		return false
	}
}
