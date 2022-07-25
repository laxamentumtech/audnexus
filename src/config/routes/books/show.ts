import { FastifyInstance } from 'fastify'

import type { BookDocument } from '#config/models/Book'
import { Book } from '#config/typing/books'
import { RequestGenericWithSeed } from '#config/typing/requests'
import SeedHelper from '#helpers/authors/audible/SeedHelper'
import StitchHelper from '#helpers/books/audible/StitchHelper'
import addTimestamps from '#helpers/database/addTimestamps'
import { PaprAudibleBookHelper } from '#helpers/database/audible'
import RedisHelper from '#helpers/database/RedisHelper'
import SharedHelper from '#helpers/shared'

async function _show(fastify: FastifyInstance) {
	fastify.get<RequestGenericWithSeed>('/books/:asin', async (request, reply) => {
		// Query params
		const options: { seed: string | undefined; update: string | undefined } = {
			seed: request.query.seedAuthors,
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
		const paprHelper = new PaprAudibleBookHelper(request.params.asin, options)
		const { redis } = fastify
		const redisHelper = new RedisHelper(redis, 'book')

		// Get book from database
		const existingBook = (await paprHelper.findOne()).data
		let book: Book | undefined = undefined

		// Add dates to data if not present
		if (existingBook && !existingBook.createdAt) {
			paprHelper.bookData = addTimestamps(existingBook) as BookDocument
			book = (await paprHelper.update()).data
		} else {
			const checkBook = await paprHelper.findOneWithProjection()
			if (checkBook.data) {
				book = checkBook.data
			}
		}

		// Check for existing or cached data from redis
		if (options.update !== '0') {
			const redisBook = await redisHelper.findOrCreate(request.params.asin, book)
			if (redisBook) return redisBook
		}

		// Check if the object was updated recently
		if (options.update == '0' && existingBook && commonHelpers.checkIfRecentlyUpdated(existingBook))
			return book

		// Proceed to stitch the book since it doesn't exist in db or is outdated
		// Setup helper
		const stitchHelper = new StitchHelper(request.params.asin)
		// Request data to be processed by helper
		const bookData = await stitchHelper.process()
		// Pass requested data to the CRUD helper
		paprHelper.bookData = bookData
		// Let CRUD helper decide how to handle the data
		const bookToReturn = await paprHelper.createOrUpdate()

		// Throw error on null return data
		if (!bookToReturn.data) {
			throw new Error(`No data returned from database for book ${request.params.asin}`)
		}

		// Update Redis if the item is modified
		if (bookToReturn.modified) {
			redisHelper.setKey(request.params.asin, bookToReturn.data)
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
