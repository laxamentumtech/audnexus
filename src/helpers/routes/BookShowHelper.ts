import { FastifyRedis } from '@fastify/redis'

import { BookDocument } from '#config/models/Book'
import { Book } from '#config/typing/books'
import { RequestGenericWithSeed } from '#config/typing/requests'
import SeedHelper from '#helpers/authors/audible/SeedHelper'
import StitchHelper from '#helpers/books/audible/StitchHelper'
import addTimestamps from '#helpers/database/addTimestamps'
import PaprAudibleBookHelper from '#helpers/database/audible/PaprAudibleBookHelper'
import RedisHelper from '#helpers/database/RedisHelper'
import SharedHelper from '#helpers/shared'

export default class BookShowHelper {
	asin: string
	bookInternal: Book | undefined = undefined
	commonHelpers: SharedHelper
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
		this.commonHelpers = new SharedHelper()
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
		// Update or create the book in cache
		await this.redisHelper.findOrCreate(bookToReturn.data)
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
		return this.commonHelpers.checkIfRecentlyUpdated(this.originalBook)
	}

	/**
	 * Update the timestamps of the book when they are missing
	 */
	async updateBookTimestamps(): Promise<Book> {
		// Return if not present or already has timestamps
		if (!this.originalBook || this.originalBook.createdAt)
			return (await this.paprHelper.findOneWithProjection()).data

		// Add timestamps
		this.paprHelper.bookData = addTimestamps(this.originalBook) as BookDocument
		// Update book in DB
		try {
			this.bookInternal = (await this.paprHelper.update()).data
		} catch (err) {
			throw new Error(`An error occurred while adding timestamps to book ${this.asin} in the DB`)
		}
		return this.bookInternal
	}

	/**
	 * Actions to run when an update is requested
	 */
	async updateActions(): Promise<Book> {
		// 1. Check if it is updated recently
		if (this.isUpdatedRecently()) return this.originalBook as Book

		// 2. Get the new book and create or update it
		const bookToReturn = await this.createOrUpdateBook()

		// 3. Update book in cache
		if (bookToReturn.modified) {
			this.redisHelper.setOne(bookToReturn.data)
		}

		// 4. Seed authors in the background
		if (this.options.seedAuthors === '1' && bookToReturn.modified) {
			const authorSeeder = new SeedHelper(bookToReturn.data)
			authorSeeder.seedAll()
		}

		// 5. Return the book
		return bookToReturn.data
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
			// 1. Make sure it has timestamps
			await this.updateBookTimestamps()
			// 2. Check it it is cached
			const redisBook = await this.redisHelper.findOrCreate(this.originalBook)
			if (redisBook) return redisBook as Book
			// 3. Return the book from DB
			return this.originalBook as Book
		}

		// If the book is not present
		return (await this.createOrUpdateBook()).data
	}
}
