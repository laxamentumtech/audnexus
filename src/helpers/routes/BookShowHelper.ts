import { FastifyRedis } from '@fastify/redis'

import { BookDocument } from '#config/models/Book'
import { Book } from '#config/typing/books'
import { isBook, isBookDocument } from '#config/typing/checkers'
import { RequestGenericWithSeed } from '#config/typing/requests'
import SeedHelper from '#helpers/authors/audible/SeedHelper'
import StitchHelper from '#helpers/books/audible/StitchHelper'
import PaprAudibleBookHelper from '#helpers/database/papr/audible/PaprAudibleBookHelper'
import RedisHelper from '#helpers/database/redis/RedisHelper'
import SharedHelper from '#helpers/shared'

export default class BookShowHelper {
	asin: string
	bookInternal: Book | undefined = undefined
	sharedHelper: SharedHelper
	paprHelper: PaprAudibleBookHelper
	redisHelper: RedisHelper
	options: RequestGenericWithSeed['Querystring']
	originalBook: BookDocument | null = null
	stitchHelper: StitchHelper
	constructor(
		asin: string,
		options: RequestGenericWithSeed['Querystring'],
		redis: FastifyRedis | null
	) {
		this.asin = asin
		this.sharedHelper = new SharedHelper()
		this.options = options
		this.paprHelper = new PaprAudibleBookHelper(this.asin, this.options)
		this.redisHelper = new RedisHelper(redis, 'book', this.asin)
		this.stitchHelper = new StitchHelper(this.asin)
	}

	async getBookFromPapr(): Promise<BookDocument | null> {
		return (await this.paprHelper.findOne()).data
	}

	async getNewBookData() {
		return this.stitchHelper.process()
	}

	async createOrUpdateBook() {
		// Place the new book data into the papr helper
		this.paprHelper.setBookData(await this.getNewBookData())
		// Create or update the book
		const bookToReturn = await this.paprHelper.createOrUpdate()
		if (!isBookDocument(bookToReturn.data)) throw new Error(`BookDocument ${this.asin} not found`)
		const data = bookToReturn.data

		// Update or create the book in cache
		await this.redisHelper.findOrCreate(data)

		// Return the book
		return bookToReturn
	}

	/**
	 * Check if the book is updated recently by comparing the timestamps of updatedAt
	 */
	isUpdatedRecently() {
		if (!this.originalBook) {
			return false
		}
		return this.sharedHelper.checkIfRecentlyUpdated(this.originalBook)
	}

	/**
	 * Actions to run when an update is requested
	 */
	async updateActions(): Promise<Book> {
		// 1. Check if it is updated recently
		if (this.isUpdatedRecently() && isBook(this.originalBook)) return this.originalBook

		// 2. Get the new book and create or update it
		const bookToReturn = await this.createOrUpdateBook()
		if (!isBookDocument(bookToReturn.data)) throw new Error(`BookDocument ${this.asin} not found`)
		const data = bookToReturn.data

		// 3. Update book in cache
		if (bookToReturn.modified) {
			this.redisHelper.setOne(data)
		}

		// 4. Seed authors in the background
		if (this.options.seedAuthors !== '0' && bookToReturn.modified) {
			const authorSeeder = new SeedHelper(data)
			authorSeeder.seedAll()
		}

		// 5. Return the book
		return data
	}

	/**
	 * Main handler for the book show route
	 */
	async handler() {
		this.originalBook = await this.getBookFromPapr()

		// If the book is already present
		if (this.originalBook) {
			// If an update is requested
			if (this.options.update === '1') {
				return this.updateActions()
			}

			// 1. Get the book with projections
			const bookToReturn = await this.paprHelper.findOneWithProjection()
			// Make saure we get a book type back
			if (!isBook(bookToReturn.data)) throw new Error(`Book ${this.asin} not found`)
			const data = bookToReturn.data

			// 2. Check it it is cached
			const redisBook = await this.redisHelper.findOrCreate(data)
			if (redisBook && isBook(redisBook)) return redisBook

			// 3. Return the book from DB
			return data
		}

		// If the book is not present
		return (await this.createOrUpdateBook()).data
	}
}
