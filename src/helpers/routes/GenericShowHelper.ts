import { FastifyRedis } from '@fastify/redis'
import type { FastifyBaseLogger } from 'fastify'

import type { AuthorDocument } from '#config/models/Author'
import type { BookDocument } from '#config/models/Book'
import type { ChapterDocument } from '#config/models/Chapter'
import { getPerformanceConfig } from '#config/performance'
import {
	ApiAuthorProfile,
	ApiAuthorProfileSchema,
	ApiBook,
	ApiBookSchema,
	ApiChapter,
	ApiChapterSchema,
	ApiQueryString
} from '#config/types'
import ScrapeHelper from '#helpers/authors/audible/ScrapeHelper'
import ChapterHelper from '#helpers/books/audible/ChapterHelper'
import StitchHelper from '#helpers/books/audible/StitchHelper'
import PaprAudibleAuthorHelper from '#helpers/database/papr/audible/PaprAudibleAuthorHelper'
import PaprAudibleBookHelper from '#helpers/database/papr/audible/PaprAudibleBookHelper'
import PaprAudibleChapterHelper from '#helpers/database/papr/audible/PaprAudibleChapterHelper'
import RedisHelper from '#helpers/database/redis/RedisHelper'
import SharedHelper from '#helpers/utils/shared'
import {
	ErrorMessageDataType,
	ErrorMessageMissingOriginal,
	ErrorMessageUpdate
} from '#static/messages'

export default class GenericShowHelper {
	asin: string
	options: ApiQueryString
	originalData: AuthorDocument | BookDocument | ChapterDocument | null = null
	paprHelper: PaprAudibleAuthorHelper | PaprAudibleBookHelper | PaprAudibleChapterHelper
	redisHelper: RedisHelper
	schema: typeof ApiAuthorProfileSchema | typeof ApiBookSchema | typeof ApiChapterSchema
	sharedHelper: SharedHelper
	type: 'author' | 'book' | 'chapter'
	logger?: FastifyBaseLogger
	constructor(
		asin: string,
		options: ApiQueryString,
		redis: FastifyRedis | null,
		type: 'author' | 'book' | 'chapter',
		logger?: FastifyBaseLogger
	) {
		this.asin = asin
		this.options = options
		this.type = type
		this.logger = logger
		this.paprHelper = this.setupPaprHelper()
		this.redisHelper = new RedisHelper(redis, type, asin, options.region, logger)
		this.schema = this.setupSchema()
		this.sharedHelper = new SharedHelper(logger)
	}

	/**
	 * Return the error message for the data type based on the type
	 * @returns {Error}
	 */
	errorMessageDataType(): Error {
		const fullType =
			this.type === 'author' ? 'ApiAuthorProfile' : this.type === 'book' ? 'ApiBook' : 'ApiChapter'
		return new Error(ErrorMessageDataType(this.asin, fullType))
	}

	/**
	 * Run the respective type's process() method
	 * @returns {Promise<ApiAuthorProfile | ApiBook | ApiChapter | undefined>}
	 * @throws {Error} Invalid type
	 */
	getNewData(): Promise<ApiAuthorProfile | ApiBook | ApiChapter | undefined> {
		if (this.type === 'author') {
			const helper = new ScrapeHelper(this.asin, this.options.region, this.logger)
			return helper.process()
		} else if (this.type === 'book') {
			const helper = new StitchHelper(this.asin, this.options.region, this.logger)
			return helper.process()
		} else {
			const helper = new ChapterHelper(this.asin, this.options.region, this.logger)
			return helper.process()
		}
	}

	/**
	 * Setup the paprHelper based on the type
	 * @returns {PaprAudibleAuthorHelper | PaprAudibleBookHelper | PaprAudibleChapterHelper}
	 * @throws {Error} Invalid type
	 */
	setupPaprHelper(): PaprAudibleAuthorHelper | PaprAudibleBookHelper | PaprAudibleChapterHelper {
		if (this.type === 'author') {
			return new PaprAudibleAuthorHelper(this.asin, this.options, this.logger)
		} else if (this.type === 'book') {
			return new PaprAudibleBookHelper(this.asin, this.options, this.logger)
		} else {
			return new PaprAudibleChapterHelper(this.asin, this.options, this.logger)
		}
	}

	/**
	 * Setup the schema based on the type
	 * @returns {typeof ApiAuthorProfileSchema | typeof ApiBookSchema | typeof ApiChapterSchema}
	 * @throws {Error} Invalid type
	 */
	setupSchema(): typeof ApiAuthorProfileSchema | typeof ApiBookSchema | typeof ApiChapterSchema {
		if (this.type === 'author') {
			return ApiAuthorProfileSchema
		} else if (this.type === 'book') {
			return ApiBookSchema
		} else {
			return ApiChapterSchema
		}
	}

	/**
	 * Get the original data from the database
	 * @returns {Promise<AuthorDocument | BookDocument | ChapterDocument | null>}
	 */
	async getDataFromPapr(): Promise<AuthorDocument | BookDocument | ChapterDocument | null> {
		return (await this.paprHelper.findOne()).data
	}

	/**
	 * Get the data with projections,
	 * making sure the data is the correct type.
	 * Then sort the data and return it.
	 * @returns {Promise<ApiAuthorProfile | ApiBook | ApiChapter>}
	 * @throws {Error} Data is null or not the correct type
	 */
	async getDataWithProjection(): Promise<ApiAuthorProfile | ApiBook | ApiChapter> {
		// 1. Get data with projections
		const data = await this.paprHelper.findOneWithProjection()
		// Make sure data is not null
		if (data.data === null) throw this.errorMessageDataType()

		// 2. Sort data if feature flag enabled (adds O(n log n) overhead)
		const perfConfig = getPerformanceConfig()
		const dataToParse = perfConfig.USE_SORTED_KEYS
			? this.sharedHelper.sortObjectByKeys(data.data)
			: data.data
		// Parse the data to make sure it's the correect type
		const parsed = this.schema.safeParse(dataToParse)
		// If the data is not the correct type, throw an error
		if (!parsed.success) throw this.errorMessageDataType()
		return parsed.data
	}

	/**
	 * Get the new data and pass it to the paprHelper to create or update the data
	 * Then, set redis cache and return the data
	 * @returns {Promise<ApiAuthorProfile | ApiBook | ApiChapter | undefined>}
	 * @throws {Error} Data is null or not the correct type
	 */
	async createOrUpdateData(): Promise<ApiAuthorProfile | ApiBook | ApiChapter | undefined> {
		// 1. Place the new data into the paprHelper
		const newData = await this.getNewData()
		// Special handling for chapter undefined
		if (this.type == 'chapter' && !newData) return undefined

		this.paprHelper.setData(newData as never)

		// 2. Create or update the data
		const dataToReturn = await this.paprHelper.createOrUpdate()
		if (dataToReturn.data === null) throw this.errorMessageDataType()

		// 3. Get the data with projections
		const data = await this.getDataWithProjection()

		// 4. Update or create the data in redis
		this.redisHelper.setOne(data)

		return data
	}

	/**
	 * Check if the data is updated recently by comparing the timestamps of updatedAt
	 */
	isUpdatedRecently(): boolean {
		if (!this.originalData) {
			return false
		}
		return this.sharedHelper.isRecentlyUpdated(this.originalData)
	}

	/**
	 * Actions to run when an update is requested.
	 * @returns {Promise<ApiAuthorProfile | ApiBook | ApiChapter | undefined>}
	 * @throws {Error} Missing original data
	 */
	async updateActions(): Promise<ApiAuthorProfile | ApiBook | ApiChapter | undefined> {
		if (!this.originalData) throw new Error(ErrorMessageMissingOriginal(this.asin, this.type))
		// 1. Check if the data is updated recently
		if (this.isUpdatedRecently()) return this.getDataWithProjection()

		// 2. Update the data,
		// return undefined for chapters if the data is not updated
		// Return the original data if there is an error
		const dataOnError = this.type === 'chapter' ? undefined : this.originalData
		const data =
			(await this.createOrUpdateData()
				.then((data) => data)
				.catch((err) => {
					// Preserve custom errors with statusCode (NotFoundError, BadRequestError)
					if (err instanceof Error && 'statusCode' in err) {
						throw err
					}
					// If err is already an Error instance, rethrow it as-is
					if (err instanceof Error) {
						throw err
					}
					// Otherwise wrap with string conversion
					throw new Error(String(err))
				})) || dataOnError

		// 3. Return the data
		return data
	}

	/**
	 * Main handler for the class
	 * 1. Check redis for data
	 * 2. Check if data exists in DB
	 * 3. If data exists in DB, check if we need to update it
	 * 4. If data does not exist in DB, create it
	 * @returns {Promise<ApiAuthorProfile | ApiBook | ApiChapter | undefined>}
	 */
	async handler(): Promise<ApiAuthorProfile | ApiBook | ApiChapter | undefined> {
		// 1.
		// Check if the data exists in redis
		const redisData = await this.redisHelper.findOne()

		// If the data exists in redis, return it. Unless we want to update it
		if (redisData && this.options.update !== '1') {
			const parsed = this.schema.safeParse(redisData)
			if (parsed.success) return parsed.data
		}

		// 2.
		this.originalData = await this.getDataFromPapr()

		if (this.originalData) {
			// 3.
			if (this.options.update === '1') {
				// Try to update the data, if it fails, throw an error
				try {
					return await this.updateActions()
				} catch (err) {
					// Preserve custom errors with statusCode (NotFoundError, BadRequestError)
					if (err instanceof Error && 'statusCode' in err) {
						throw err
					}
					throw new Error(ErrorMessageUpdate(this.asin, this.type))
				}
			}

			// 2.
			const data = await this.getDataWithProjection()

			// Re-set the data in redis
			this.redisHelper.setOne(data)

			return data
		}

		// 4.
		return this.createOrUpdateData()
	}
}
