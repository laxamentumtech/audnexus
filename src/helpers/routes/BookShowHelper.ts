import { FastifyRedis } from '@fastify/redis'

import { BookDocument } from '#config/models/Book'
import { Book } from '#config/typing/books'
import { isBook } from '#config/typing/checkers'
import { RequestGenericWithSeed } from '#config/typing/requests'
import SeedHelper from '#helpers/authors/audible/SeedHelper'
import StitchHelper from '#helpers/books/audible/StitchHelper'
import PaprAudibleBookHelper from '#helpers/database/papr/audible/PaprAudibleBookHelper'
import RedisHelper from '#helpers/database/redis/RedisHelper'
import SharedHelper from '#helpers/utils/shared'
import { ErrorMessageDataType } from '#static/messages'

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
		this.stitchHelper = new StitchHelper(this.asin, this.options.region)
	}

	/**
	 * Get the BookDocument from Papr
	 */
	async getBookFromPapr(): Promise<BookDocument | null> {
		return (await this.paprHelper.findOne()).data
	}

	/**
	 * Get the book with projections,
	 * making sure the data is the correct type.
	 * Then, sort the data and return it.
	 */
	async getBookWithProjection(): Promise<Book> {
		// 1. Get the book with projections
		const bookToReturn = await this.paprHelper.findOneWithProjection()
		// Make saure we get a book type back
		if (!isBook(bookToReturn.data)) throw new Error(ErrorMessageDataType(this.asin, 'Book'))

		// 2. Sort the object
		const sort = this.sharedHelper.sortObjectByKeys(bookToReturn.data)
		if (isBook(sort)) return sort

		throw new Error(ErrorMessageDataType(this.asin, 'Book'))
	}

	/**
	 * Run the scraper to get the book data
	 */
	async getNewBookData() {
		return this.stitchHelper.process()
	}

	/**
	 * Get new book data and pass it to the create or update papr function.
	 * Then, set redis cache and return the book.
	 */
	async createOrUpdateBook(): Promise<Book> {
		// Place the new book data into the papr helper
		this.paprHelper.setBookData(await this.getNewBookData())

		// Create or update the book
		const bookToReturn = await this.paprHelper.createOrUpdate()
		if (!isBook(bookToReturn.data)) throw new Error(ErrorMessageDataType(this.asin, 'Book'))

		// Get the book with projections
		const data = await this.getBookWithProjection()

		// Update or create the book in cache
		this.redisHelper.setOne(data)

		// Return the book
		return data
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
		if (this.isUpdatedRecently()) return this.getBookWithProjection()

		// 2. Get the new book and create or update it
		const data = await this.createOrUpdateBook()

		// 3. Seed authors in the background
		if (this.options.seedAuthors !== '0') {
			const authorSeeder = new SeedHelper(data)
			authorSeeder.seedAll()
		}

		// 4. Return the book
		return data
	}

	/**
	 * Main handler for the book show route
	 */
	async handler(): Promise<Book> {
		this.originalBook = await this.getBookFromPapr()

		// If the book is already present
		if (this.originalBook) {
			// If an update is requested
			if (this.options.update === '1') {
				return this.updateActions()
			}

			// 1. Get the book with projections
			const data = await this.getBookWithProjection()

			// 2. Check it it is cached
			const redisBook = await this.redisHelper.findOrCreate(data)
			if (redisBook && isBook(redisBook)) return redisBook

			// 3. Return the book from DB
			return data
		}

		// If the book is not present
		return this.createOrUpdateBook()
	}
}
