import { FastifyInstance } from 'fastify'

import type { AuthorDocument } from '#config/models/Author'
import { AuthorProfile } from '#config/typing/people'
import { RequestGeneric } from '#config/typing/requests'
import ScrapeHelper from '#helpers/authors/audible/ScrapeHelper'
import addTimestamps from '#helpers/database/addTimestamps'
import PaprAudibleAuthorHelper from '#helpers/database/audible/PaprAudibleAuthorHelper'
import RedisHelper from '#helpers/database/RedisHelper'
import SharedHelper from '#helpers/shared'

async function _show(fastify: FastifyInstance) {
	fastify.get<RequestGeneric>('/authors/:asin', async (request, reply) => {
		// Query params
		const options: RequestGeneric['Querystring'] = {
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
		const paprHelper = new PaprAudibleAuthorHelper(request.params.asin, options)
		const { redis } = fastify
		const redisHelper = new RedisHelper(redis, 'author', request.params.asin)

		// Get author from database
		const existingAuthor = (await paprHelper.findOne()).data
		let author: AuthorProfile | undefined = undefined

		// Add dates to data if not present
		if (existingAuthor && !existingAuthor.createdAt) {
			paprHelper.authorData = addTimestamps(existingAuthor) as AuthorDocument
			author = (await paprHelper.update()).data
		} else {
			const checkAuthor = await paprHelper.findOneWithProjection()
			if (checkAuthor.data) {
				author = checkAuthor.data
			}
		}

		// Check for existing or cached data from redis
		if (options.update !== '0') {
			const redisAuthor = await redisHelper.findOrCreate(author)
			if (redisAuthor) return redisAuthor
		}

		// Check if the object was updated recently
		if (
			options.update == '0' &&
			existingAuthor &&
			commonHelpers.checkIfRecentlyUpdated(existingAuthor)
		)
			return author

		// Proceed to scrape the author since it doesn't exist in db or is outdated
		// Set up helper
		const scrapeHelper = new ScrapeHelper(request.params.asin)
		// Request data to be processed by helper
		const authorData = await scrapeHelper.process()
		// Pass requested data to the CRUD helper
		paprHelper.authorData = authorData
		// Let CRUD helper decide how to handle the data
		const authorToReturn = await paprHelper.createOrUpdate()

		// Throw error on null return data
		if (!authorToReturn.data) {
			throw new Error(`No data returned from database for author ${request.params.asin}`)
		}

		// Update Redis if the item is modified
		if (authorToReturn.modified) {
			redisHelper.setOne(authorToReturn.data)
		}

		return authorToReturn.data
	})
}

export default _show
