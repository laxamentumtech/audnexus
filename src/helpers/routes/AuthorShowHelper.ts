import { FastifyRedis } from '@fastify/redis'

import type { AuthorDocument } from '#config/models/Author'
import { ApiAuthorProfile, ApiAuthorProfileSchema } from '#config/types'
import { ParsedQuerystring } from '#config/typing/requests'
import ScrapeHelper from '#helpers/authors/audible/ScrapeHelper'
import PaprAudibleAuthorHelper from '#helpers/database/papr/audible/PaprAudibleAuthorHelper'
import RedisHelper from '#helpers/database/redis/RedisHelper'
import SharedHelper from '#helpers/utils/shared'
import { ErrorMessageDataType } from '#static/messages'

export default class AuthorShowHelper {
	asin: string
	authorInternal: ApiAuthorProfile | undefined = undefined
	sharedHelper: SharedHelper
	paprHelper: PaprAudibleAuthorHelper
	redisHelper: RedisHelper
	options: ParsedQuerystring
	scrapeHelper: ScrapeHelper
	originalAuthor: AuthorDocument | null = null
	constructor(asin: string, options: ParsedQuerystring, redis: FastifyRedis | null) {
		this.asin = asin
		this.sharedHelper = new SharedHelper()
		this.options = options
		this.paprHelper = new PaprAudibleAuthorHelper(this.asin, this.options)
		this.redisHelper = new RedisHelper(redis, 'book', this.asin, options.region)
		this.scrapeHelper = new ScrapeHelper(this.asin, this.options.region)
	}

	/**
	 * Get the AuthorDocument from Papr
	 */
	async getAuthorFromPapr(): Promise<AuthorDocument | null> {
		return (await this.paprHelper.findOne()).data
	}

	/**
	 * Get the author with projections,
	 * making sure the data is the correct type.
	 * Then, sort the data and return it.
	 */
	async getAuthorWithProjection(): Promise<ApiAuthorProfile> {
		// 1. Get the author with projections
		const author = await this.paprHelper.findOneWithProjection()
		// Make sure we get a authorprofile type back
		if (author.data === null) throw new Error(ErrorMessageDataType(this.asin, 'ApiAuthorProfile'))

		// 2. Sort the object
		const sort = this.sharedHelper.sortObjectByKeys(author.data)
		// Parse the data to make sure it's the correct type
		const parsed = ApiAuthorProfileSchema.safeParse(sort)
		// If the data is not the correct type, throw an error
		if (!parsed.success) throw new Error(ErrorMessageDataType(this.asin, 'ApiAuthorProfile'))
		return parsed.data
	}

	/**
	 * Search for an author in the database by name
	 */
	async getAuthorsByName() {
		return (await this.paprHelper.findByName()).data
	}

	/**
	 * Run the scraper to get the author data
	 */
	async getNewAuthorData() {
		return this.scrapeHelper.process()
	}

	/**
	 * Get new author data and pass it to the create or update papr function.
	 * Then, set redis cache and return the author.
	 */
	async createOrUpdateAuthor(): Promise<ApiAuthorProfile> {
		// Place the new author data into the papr helper
		this.paprHelper.setAuthorData(await this.getNewAuthorData())

		// Create or update the author
		const authorToReturn = await this.paprHelper.createOrUpdate()
		if (authorToReturn.data === null)
			throw new Error(ErrorMessageDataType(this.asin, 'ApiAuthorProfile'))

		// Get the author with projections
		const data = await this.getAuthorWithProjection()

		// Update or create the author in cache
		this.redisHelper.setOne(data)

		// Return the author
		return data
	}

	/**
	 * Check if the author is updated recently by comparing the timestamps of updatedAt
	 */
	isUpdatedRecently() {
		if (!this.originalAuthor) {
			return false
		}
		return this.sharedHelper.isRecentlyUpdated(this.originalAuthor)
	}

	/**
	 * Actions to run when an update is requested
	 */
	async updateActions(): Promise<ApiAuthorProfile> {
		// 1. Check if it is updated recently
		if (this.isUpdatedRecently()) return this.getAuthorWithProjection()

		// 2. Create or update the author
		return this.createOrUpdateAuthor()
	}

	/**
	 * Main handler for the author show route
	 */
	async handler(): Promise<ApiAuthorProfile> {
		this.originalAuthor = await this.getAuthorFromPapr()

		// If the author is already present
		if (this.originalAuthor) {
			// If an update is requested
			if (this.options.update === '1') {
				return this.updateActions()
			}

			// 1. Get the author with projections
			const data = await this.getAuthorWithProjection()

			// 2. Check it it is cached
			const redisAuthor = await this.redisHelper.findOrCreate(data)
			if (redisAuthor) {
				// Parse the data to make sure it's the correct type
				const parsedData = ApiAuthorProfileSchema.safeParse(redisAuthor)
				if (parsedData.success) return parsedData.data
			}

			// 3. Return the author from DB
			return data
		}

		// If the author is not present
		return this.createOrUpdateAuthor()
	}
}
