import { FastifyInstance } from 'fastify'

import type { BookDocument } from '#config/models/Book'
import { RequestGenericWithSeed } from '#config/typing/requests'
import SeedHelper from '#helpers/authors/audible/SeedHelper'
import StitchHelper from '#helpers/books/audible/StitchHelper'
import addTimestamps from '#helpers/database/addTimestamps'
import { PaprAudibleBookHelper } from '#helpers/database/audible'
import SharedHelper from '#helpers/shared'

async function _show(fastify: FastifyInstance) {
	fastify.get<RequestGenericWithSeed>('/books/:asin', async (request, reply) => {
		// Query params
		const options: { seed: string | undefined; update: string | undefined } = {
			seed: request.query.seedAuthors,
			update: request.query.update
		}

		// Setup Helpers
		const commonHelpers = new SharedHelper()
		const DbHelper = new PaprAudibleBookHelper(request.params.asin, options)

		// First, check ASIN validity
		if (!commonHelpers.checkAsinValidity(request.params.asin)) {
			reply.code(400)
			throw new Error('Bad ASIN')
		}

		const { redis } = fastify
		// Set redis k,v function
		const setRedis = (asin: string, newDbItem: BookDocument) => {
			redis?.set(`book-${asin}`, JSON.stringify(newDbItem, null, 2))
		}
		// Search redis if available
		const findInRedis = redis
			? await redis.get(`book-${request.params.asin}`, (_err, val) => {
					if (!val) return undefined
					return JSON.parse(val)
			  })
			: undefined

		let existingBook = await DbHelper.findOne()

		// Add dates to data if not present
		if (existingBook.data && !existingBook.data.createdAt) {
			DbHelper.bookData = addTimestamps(existingBook.data) as BookDocument
			existingBook = await DbHelper.update()
		}

		// Check for existing or cached data
		if (options.update !== '0' && findInRedis) {
			return JSON.parse(findInRedis)
		} else if (options.update !== '0' && existingBook.data) {
			setRedis(request.params.asin, existingBook.data)
			return existingBook.data
		}

		// Check if the object was updated recently
		if (options.update == '0' && commonHelpers.checkIfRecentlyUpdated(existingBook.data))
			return existingBook.data

		// Setup helper
		const stitchHelper = new StitchHelper(request.params.asin)
		// Request data to be processed by helper
		const bookData = await stitchHelper.process()
		// Pass requested data to the CRUD helper
		DbHelper.bookData = bookData
		// Let CRUD helper decide how to handle the data
		const bookToReturn = await DbHelper.createOrUpdate()

		// Throw error on null return data
		if (!bookToReturn.data) {
			throw new Error(`No data returned from database for book ${request.params.asin}`)
		}

		// Update Redis if the item is modified
		if (bookToReturn.modified) {
			setRedis(request.params.asin, bookToReturn.data)
		}

		// Seed authors in the background if it's a new/updated book
		if (options.seed !== '0' && bookToReturn.modified) {
			const authorSeeder = new SeedHelper(bookToReturn.data)
			authorSeeder.seedAll()
		}

		return bookToReturn.data
	})
}

export default _show
