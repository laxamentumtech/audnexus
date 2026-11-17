import type { FastifyBaseLogger } from 'fastify'

import BookModel, { BookDocument } from '#config/models/Book'
import { ApiBook, ApiBookSchema, ApiQueryString } from '#config/types'
import { isBookDocument } from '#config/typing/checkers'
import { PaprBookDocumentReturn, PaprBookReturn, PaprDeleteReturn } from '#config/typing/papr'
import { buildEffectiveWrite } from '#helpers/database/bookWriteProjection'
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
	 * Updates an existing book when `options.update` is 1 and the
	 * effective write (stored projection + incoming evidence, retention
	 * rules for evidence-free fields) differs from the stored row. A
	 * tags/ratings-only change persists; empty incoming genres no
	 * longer block an update.
	 */
	async createOrUpdate(): Promise<PaprBookReturn> {
		const findInDb = await this.findOneWithProjection()

		// Update
		if (this.options.update === '1' && findInDb.data) {
			const data = findInDb.data
			const { book: effective } = buildEffectiveWrite(data, this.bookData, {})
			// If the effective write is the exact same row return right away
			const isEqual = this.sharedHelper.isEqualData(data, effective)
			if (isEqual) {
				// An equal accepted refresh supersedes a backfill skip
				// decision: a row marked non-book that keeps refreshing as a
				// book must leave the marker behind. Conditional, so the
				// no-write fast path costs nothing when no marker exists.
				await BookModel.updateOne(
					{
						asin: this.asin,
						$or: [{ region: { $exists: false } }, { region: this.options.region }],
						ratingsBackfillSkip: { $exists: true }
					},
					{ $unset: { ratingsBackfillSkip: '' } }
				)
				return {
					data: data,
					modified: false
				}
			}
			this.logger?.info(NoticeUpdateAsin(this.asin, 'book'))
			// update() re-reads the row and rebuilds the effective write
			// against that fresh read, so evidence-free fields (rating,
			// series, stored tags/Goodreads) are $set with the current
			// stored values, and a concurrent refresh that lands between
			// this read and the write is not restored from a stale
			// snapshot.
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
			// Rebuild the effective write against THIS fresh read, not a
			// snapshot the caller took on an earlier read: a concurrent
			// refresh that committed in between is not clobbered, and
			// retained evidence-free fields take their values from the
			// current row.
			const storedParsed = ApiBookSchema.safeParse(found.data)
			const { book: effective } = buildEffectiveWrite(
				storedParsed.success ? storedParsed.data : null,
				this.bookData,
				{}
			)
			await BookModel.updateOne(
				{
					asin: this.asin,
					$or: [{ region: { $exists: false } }, { region: this.options.region }]
				},
				{
					$set: { ...effective, createdAt: found.data._id.getTimestamp() },
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
