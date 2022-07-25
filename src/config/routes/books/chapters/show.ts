import { FastifyInstance } from 'fastify'

import { ChapterDocument } from '#config/models/Chapter'
import { ApiChapter } from '#config/typing/books'
import { RequestGeneric } from '#config/typing/requests'
import ChapterHelper from '#helpers/books/audible/ChapterHelper'
import addTimestamps from '#helpers/database/addTimestamps'
import { PaprAudibleChapterHelper } from '#helpers/database/audible'
import RedisHelper from '#helpers/database/RedisHelper'
import SharedHelper from '#helpers/shared'

async function _show(fastify: FastifyInstance) {
	fastify.get<RequestGeneric>('/books/:asin/chapters', async (request, reply) => {
		// Query params
		const options: { update: string | undefined } = {
			update: request.query.update
		}

		// Setup common helper first
		const commonHelpers = new SharedHelper()
		// First, check ASIN validity
		if (!commonHelpers.checkAsinValidity(request.params.asin)) {
			reply.code(400)
			throw new Error('Bad ASIN')
		}

		// Setup Helpers
		const paprHelper = new PaprAudibleChapterHelper(request.params.asin, options)
		const { redis } = fastify
		const redisHelper = new RedisHelper(redis, 'chapters')

		// Get chapters from database
		const existingChapter = (await paprHelper.findOne()).data
		let chapter: ApiChapter | undefined = undefined

		// Add dates to data if not present
		if (existingChapter && !existingChapter.createdAt) {
			paprHelper.chapterData = addTimestamps(existingChapter) as ChapterDocument
			chapter = (await paprHelper.update()).data
		} else {
			const checkChapter = await paprHelper.findOneWithProjection()
			if (checkChapter.data) {
				chapter = checkChapter.data
			}
		}

		// Check for existing or cached data from redis
		if (options.update !== '0') {
			const redisChapter = await redisHelper.findOrCreate(request.params.asin, chapter)
			if (redisChapter) return redisChapter
		}

		// Check if the object was updated recently
		if (
			options.update == '0' &&
			existingChapter &&
			commonHelpers.checkIfRecentlyUpdated(existingChapter)
		)
			return chapter

		// Set up helper
		const chapterHelper = new ChapterHelper(request.params.asin)
		// Request data to be processed by helper
		const chapterData = await chapterHelper.process()
		// Continue only if chapters exist
		if (!chapterData) {
			reply.code(404)
			throw new Error(`No Chapters for ${request.params.asin}`)
		}
		paprHelper.chapterData = chapterData
		// Let CRUD helper decide how to handle the data
		const chapterToReturn = await paprHelper.createOrUpdate()

		// Throw error on null return data
		if (!chapterToReturn.data) {
			throw new Error(`No data returned from database for chapter ${request.params.asin}`)
		}

		// Update Redis if the item is modified
		if (chapterToReturn.modified) {
			redisHelper.setKey(request.params.asin, chapterToReturn.data)
		}

		return chapterToReturn.data
	})
}

export default _show
