import type { FastifyBaseLogger } from 'fastify'

import BookModel, { BookDocument } from '#config/models/Book'
import { ApiBook, ApiBookSchema, ApiQueryString } from '#config/types'
import { isBookDocument } from '#config/typing/checkers'
import { PaprBookDocumentReturn, PaprBookReturn, PaprDeleteReturn } from '#config/typing/papr'
import { mergeStoredGenresWhenIncomingEmpty } from '#helpers/database/papr/BookHistoryStore'
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
	 * Updates an existing book if:
	 *
	 * 1. `options.update` is 1 and the book exists
	 * 2. The incoming data is different from the existing data. The
	 *    comparison uses the genre-preserving merge: incoming genres
	 *    replace the stored list, and with no incoming genre evidence the
	 *    stored list is used for the comparison only
	 * 3. The write never clobbers stored genres with stale read-time data.
	 *    Without incoming genre evidence the `genres` key is absent from
	 *    the $set, so a concurrent genre update between the read and the
	 *    write survives
	 */
	async createOrUpdate(): Promise<PaprBookReturn> {
		const findInDb = await this.findOneWithProjection()

		// Update
		if (this.options.update === '1' && findInDb.data) {
			const data = findInDb.data
			// Compare the genre-preserving merge (BookHistoryStore parity,
			// the same enforcement point the history path runs before its
			// equality short-circuit): with no incoming genre evidence the
			// stored genres stand in for the comparison so an unchanged
			// genre-less observation short-circuits (modified: false, no
			// write), and with no stored genres the merge is the incoming
			// book. Genre-less legacy rows stay updatable: refusing here
			// froze every other field on them, and the books validator
			// rejects partial repairs. The merge is the comparison input
			// only. this.bookData (which update() $sets) keeps the incoming
			// book as-is, so without incoming genre evidence the $set has
			// no `genres` key and a concurrent genre update that commits
			// between the read and the write is not clobbered by the stale
			// read-time list.
			const comparisonBook = mergeStoredGenresWhenIncomingEmpty(
				data as Record<string, unknown>,
				this.bookData
			)
			// An empty genre list is no genre evidence (the producer emits
			// `genres: []` for ladder-less books). isEqualData treats
			// `genres: []` and an absent key as different, so strip the
			// empty list from both comparison copies first; the write path
			// is untouched and the $set still carries the incoming book
			// as-is.
			const normalize = (side: Record<string, unknown>): Record<string, unknown> => {
				if (Array.isArray(side.genres) && side.genres.length === 0) delete side.genres
				return side
			}
			// If the objects are the exact same return right away
			const isEqual = this.sharedHelper.isEqualData(
				normalize({ ...(data as Record<string, unknown>) }),
				normalize({ ...comparisonBook })
			)
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
