import type { FastifyBaseLogger } from 'fastify'

import BookModel, { BookDocument } from '#config/models/Book'
import { ApiBook, ApiBookSchema, ApiQueryString } from '#config/types'
import { isBookDocument } from '#config/typing/checkers'
import { PaprBookDocumentReturn, PaprBookReturn, PaprDeleteReturn } from '#config/typing/papr'
import getErrorMessage from '#helpers/utils/getErrorMessage'
import SharedHelper from '#helpers/utils/shared'
import {
	ErrorMessageCreate,
	ErrorMessageDelete,
	ErrorMessageNotFoundInDb,
	ErrorMessageUpdate,
	NoticeUpdateAsin
} from '#static/messages'

export default class PaprAudibleBookHelper {
	asin: string
	bookData!: ApiBook
	options: ApiQueryString
	sharedHelper = new SharedHelper()
	logger?: FastifyBaseLogger

	constructor(asin: string, options: ApiQueryString, logger?: FastifyBaseLogger) {
		this.asin = asin
		this.options = options
		this.logger = logger
	}

	/**
	 * Inserts a new book into the DB
	 * using bookData from the constructor
	 */
	async create(): Promise<PaprBookReturn> {
		try {
			await BookModel.insertOne(this.bookData)
			return {
				data: (await this.findOneWithProjection()).data,
				modified: true
			}
		} catch (error) {
			const message = getErrorMessage(error)
			this.logger?.error(message)
			throw new Error(ErrorMessageCreate(this.asin, 'book'))
		}
	}

	/**
	 * Deletes a book from the DB
	 * using asin from the constructor
	 */
	async delete(): Promise<PaprDeleteReturn> {
		try {
			const deletedBook = await BookModel.deleteOne({
				asin: this.asin,
				$or: [{ region: { $exists: false } }, { region: this.options.region }]
			})
			return {
				data: deletedBook,
				modified: true
			}
		} catch (error) {
			const message = getErrorMessage(error)
			this.logger?.error(message)
			throw new Error(ErrorMessageDelete(this.asin, 'book'))
		}
	}

	/**
	 * Finds a book in the DB
	 * using asin from the constructor.
	 * Returns unaltered Document.
	 */
	async findOne(): Promise<PaprBookDocumentReturn> {
		const findOneBook = await BookModel.findOne({
			asin: this.asin,
			$or: [{ region: { $exists: false } }, { region: this.options.region }]
		})

		// Assign type to book data
		const data: BookDocument | null = isBookDocument(findOneBook) ? findOneBook : null

		return {
			data: data,
			modified: false
		}
	}

	/**
	 * Finds a book in the DB
	 * using asin from the constructor.
	 * Returns altered Document using projection.
	 */
	async findOneWithProjection(): Promise<PaprBookReturn> {
		const findOneBook = await BookModel.findOne({
			asin: this.asin,
			$or: [{ region: { $exists: false } }, { region: this.options.region }]
		})

		// Parse data to ensure it's the correct type and remove any extra fields
		const dataParsed = ApiBookSchema.safeParse(findOneBook)
		// Assign data to variable if it's valid, otherwise assign null
		const data = dataParsed.success ? dataParsed.data : null

		return {
			data: data,
			modified: false
		}
	}

	/**
	 * Set bookData in the class object
	 */
	setData(bookData: ApiBook) {
		this.bookData = bookData
	}

	/**
	 * Creates a book if it doesn't exist.
	 *
	 * Updates a existing book if:
	 *
	 * 1. `options.update` is 1 and the book exists
	 * 2. The incoming data is different from the existing data
	 * 3. Genres exist or are different
	 */
	async createOrUpdate(): Promise<PaprBookReturn> {
		const findInDb = await this.findOneWithProjection()

		// Update
		if (this.options.update === '1' && findInDb.data) {
			const data = findInDb.data
			// If the objects are the exact same return right away
			const isEqual = this.sharedHelper.isEqualData(data, this.bookData)
			if (isEqual) {
				return {
					data: data,
					modified: false
				}
			}
			// Check state of existing book
			// Only update if either genres exist and can be checked
			// -or if genres exist on new item but not old
			if (data.genres || (!data.genres && this.bookData.genres)) {
				// Only update if it's not nuked data
				if (this.bookData.genres?.length) {
					this.logger?.info(NoticeUpdateAsin(this.asin, 'book'))
					// Update
					return this.update()
				}
			}
			// No update performed, return original
			return findInDb
		}

		// Create
		return this.create()
	}

	/**
	 * Updates a book in the DB
	 * using asin from the constructor.
	 * Always sets createdAt and updatedAt fields.
	 * Returns altered Document using findOneWithProjection.
	 */
	async update(): Promise<PaprBookReturn> {
		try {
			const found = await this.findOne()
			if (!found.data) {
				throw new Error(ErrorMessageNotFoundInDb(this.asin, 'Book'))
			}
			await BookModel.updateOne(
				{
					asin: this.asin,
					$or: [{ region: { $exists: false } }, { region: this.options.region }]
				},
				{
					$set: { ...this.bookData, createdAt: found.data._id.getTimestamp() },
					$currentDate: { updatedAt: true }
				}
			)
			// After updating, return with specific projection
			const updatedBook = await this.findOneWithProjection()
			// Set modified to true to indicate that the data has been updated
			updatedBook.modified = true
			return updatedBook
		} catch (error) {
			const message = getErrorMessage(error)
			this.logger?.error(message)
			throw new Error(ErrorMessageUpdate(this.asin, 'book'))
		}
	}
}
