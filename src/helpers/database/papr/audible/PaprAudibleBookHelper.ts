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
			throw new Error(ErrorMessageCreate(this.asin, 'book'), { cause: error })
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
			throw new Error(ErrorMessageDelete(this.asin, 'book'), { cause: error })
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
	 * 3. The incoming data does not nuke stored genre evidence: incoming
	 *    genres replace the stored list, and when the incoming data carries
	 *    no genre evidence the stored genres are preserved in the write
	 */
	async createOrUpdate(): Promise<PaprBookReturn> {
		const findInDb = await this.findOneWithProjection()

		// Update
		if (this.options.update === '1' && findInDb.data) {
			const data = findInDb.data
			// An empty genre list on the incoming side is NOT genre evidence:
			// ladder-less books (skipHtml scheduler/backfill fetches) carry
			// `genres: []`, so a non-emptiness check keeps the splice honest
			// on both sides.
			const incomingHasGenres = Boolean(this.bookData.genres?.length)
			// Stored genre evidence is preserved in the write document BEFORE
			// the equality check (BookHistoryStore parity): when the incoming
			// side has no genre evidence the stored genres are spliced in so
			// no stored genre is lost; when it does, the incoming list
			// replaces the stored one. With no stored genres there is nothing
			// to protect, and refusing here froze genre-less legacy rows
			// permanently — every other field, ratings included, stayed
			// unreachable and the books validator rejects partial repairs.
			// Comparing the spliced document keeps an unchanged genre-less
			// observation in the equal short-circuit (modified: false, no
			// write), mirroring the history store's merge-before-compare.
			if (!incomingHasGenres) {
				this.bookData = { ...this.bookData, genres: data.genres ?? [] }
			}
			// If the objects are the exact same return right away
			const isEqual = this.sharedHelper.isEqualData(data, this.bookData)
			if (isEqual) {
				return {
					data: data,
					modified: false
				}
			}
			this.logger?.info(NoticeUpdateAsin(this.asin, 'book'))
			// Update
			return this.update()
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
					// An accepted book write supersedes a backfill skip decision
					// (e.g. upstream now reports a real book).
					$unset: { ratingsBackfillSkip: '' },
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
			throw new Error(ErrorMessageUpdate(this.asin, 'book'), { cause: error })
		}
	}
}
