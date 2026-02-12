import { FastifyRedis } from '@fastify/redis'
import type { FastifyBaseLogger } from 'fastify'

import { AuthorDocument } from '#config/models/Author'
import { ApiQueryString } from '#config/types'
import PaprAudibleAuthorHelper from '#helpers/database/papr/audible/PaprAudibleAuthorHelper'
import RedisHelper from '#helpers/database/redis/RedisHelper'

export default class AuthorDeleteHelper {
	asin: string
	paprHelper: PaprAudibleAuthorHelper
	redisHelper: RedisHelper
	originalAuthor: AuthorDocument | null = null
	constructor(
		asin: string,
		options: ApiQueryString,
		redis: FastifyRedis | null,
		logger?: FastifyBaseLogger
	) {
		this.asin = asin
		this.paprHelper = new PaprAudibleAuthorHelper(this.asin, options, logger)
		this.redisHelper = new RedisHelper(redis, 'author', this.asin, options.region, logger)
	}

	async getAuthorFromPapr(): Promise<AuthorDocument | null> {
		return (await this.paprHelper.findOne()).data
	}

	/**
	 * Actions to run when a deletion is requested
	 */
	async deleteActions() {
		// 1. Delete the author from cache
		await this.redisHelper.deleteOne()

		// 2. Delete the author from DB
		return (await this.paprHelper.delete()).modified
	}

	/**
	 * Main handler for the author delete route
	 */
	async handler() {
		this.originalAuthor = await this.getAuthorFromPapr()

		// If the author is already present
		if (this.originalAuthor) {
			return this.deleteActions()
		}

		// If the author is not present
		return false
	}
}
