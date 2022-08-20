import { FastifyRedis } from '@fastify/redis'

import type { AuthorDocument } from '#config/models/Author'
import { AuthorProfile } from '#config/typing/people'
import { RequestGeneric } from '#config/typing/requests'
import ScrapeHelper from '#helpers/authors/audible/ScrapeHelper'
import addTimestamps from '#helpers/database/addTimestamps'
import PaprAudibleAuthorHelper from '#helpers/database/audible/PaprAudibleAuthorHelper'
import RedisHelper from '#helpers/database/RedisHelper'
import SharedHelper from '#helpers/shared'

export default class AuthorShowHelper {
	asin: string
	authorInternal: AuthorProfile | undefined = undefined
	commonHelpers: SharedHelper
	paprHelper: PaprAudibleAuthorHelper
	redisHelper: RedisHelper
	options: RequestGeneric['Querystring']
	scrapeHelper: ScrapeHelper
	originalAuthor: AuthorDocument | null = null
	constructor(asin: string, options: RequestGeneric['Querystring'], redis: FastifyRedis | null) {
		this.asin = asin
		this.commonHelpers = new SharedHelper()
		this.options = options
		this.paprHelper = new PaprAudibleAuthorHelper(this.asin, this.options)
		this.redisHelper = new RedisHelper(redis, 'book', this.asin)
		this.scrapeHelper = new ScrapeHelper(this.asin)
	}

	async getAuthorFromPapr(): Promise<AuthorDocument | null> {
		return (await this.paprHelper.findOne()).data
	}

	async getNewAuthorData() {
		return this.scrapeHelper.process()
	}

	async createOrUpdateAuthor() {
		// Place the new author data into the papr helper
		this.paprHelper.setAuthorData(await this.getNewAuthorData())
		// Create or update the author
		const authorToReturn = await this.paprHelper.createOrUpdate()
		// Update or create the author in cache
		await this.redisHelper.findOrCreate(authorToReturn.data)
		// Return the author
		return authorToReturn
	}

	/**
	 * Check if the author is updated recently by comparing the timestamps of updatedAt
	 */
	isUpdatedRecently() {
		if (!this.originalAuthor) {
			return false
		}
		return this.commonHelpers.checkIfRecentlyUpdated(this.originalAuthor)
	}

	/**
	 * Update the timestamps of the author when they are missing
	 */
	async updateAuthorTimestamps(): Promise<AuthorProfile> {
		// Return if not present or already has timestamps
		if (!this.originalAuthor || this.originalAuthor.createdAt)
			return (await this.paprHelper.findOneWithProjection()).data

		// Add timestamps
		this.paprHelper.authorData = addTimestamps(this.originalAuthor) as AuthorDocument
		// Update author in DB
		try {
			this.authorInternal = (await this.paprHelper.update()).data
		} catch (err) {
			throw new Error(`An error occurred while adding timestamps to author ${this.asin} in the DB`)
		}
		return this.authorInternal
	}

	/**
	 * Actions to run when an update is requested
	 */
	async updateActions(): Promise<AuthorProfile> {
		// 1. Check if it is updated recently
		if (this.isUpdatedRecently()) return this.originalAuthor as AuthorProfile

		// 2. Get the new author and create or update it
		const authorToReturn = await this.createOrUpdateAuthor()

		// 3. Update author in cache
		if (authorToReturn.modified) {
			this.redisHelper.setOne(authorToReturn.data)
		}

		// 4. Return the author
		return authorToReturn.data
	}

	/**
	 * Main handler for the author show route
	 */
	async handler() {
		this.originalAuthor = await this.getAuthorFromPapr()

		// If the author is already present
		if (this.originalAuthor) {
			// If an update is requested
			if (this.options.update === '1') {
				return this.updateActions()
			}
			// 1. Make sure it has timestamps
			await this.updateAuthorTimestamps()
			// 2. Check it it is cached
			const redisAuthor = await this.redisHelper.findOrCreate(this.originalAuthor)
			if (redisAuthor) return redisAuthor as AuthorProfile
			// 3. Return the author from DB
			return this.originalAuthor as AuthorProfile
		}

		// If the author is not present
		return (await this.createOrUpdateAuthor()).data
	}
}
