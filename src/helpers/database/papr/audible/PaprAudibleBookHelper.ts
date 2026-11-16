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
	/**
	 * True when the caller-supplied book carried its own genre evidence
	 * (recorded in `createOrUpdate` before the genre-preserving merge
	 * copies stored genres into a genre-less incoming book).
	 */
	incomingHadGenres = false
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
		// Genre evidence on the INCOMING book, recorded before the
		// preservation merge in `createOrUpdate` copies stored genres
		// into a genre-less incoming book.
		this.incomingHadGenres = Boolean(bookData.genres?.length)
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
			// Genre preservation (mirrors
			// BookHistoryStore.persistObservation): background passes skip
			// the HTML scrape, so a ladder-less API response yields a
			// genre-less book. When the incoming book carries no genre
			// evidence at all, retain the stored genres so the remaining
			// changed fields (title, ratings) persist through the genre
			// safeguard below; a book-with-genres incoming update is
			// untouched, and the stored-only-genres merge makes the
			// equal-short-circuit see equal data.
			if (!this.bookData.genres?.length && Array.isArray(data.genres) && data.genres.length > 0) {
				this.bookData = { ...this.bookData, genres: data.genres }
			}
			// If the objects are the exact same return right away
			const isEqual = this.sharedHelper.isEqualData(data, this.bookData)
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
			// Check state of existing book
			// Update when the incoming data carries genre evidence, or when the
			// stored row never had any: with no stored genres there is nothing
			// the update could nuke, and refusing here froze genre-less legacy
			// rows permanently — every other field, ratings included, stayed
			// unreachable and the books validator rejects partial repairs.
			// `genres: []` is NO evidence: `Boolean([])` would treat an
			// empty stored ladder as protection and freeze genre-less
			// legacy rows (matching the history store's safeguard).
			const storedHasGenres = Boolean(data.genres?.length)
			const incomingHasGenres = Boolean(this.bookData.genres?.length)
			if (incomingHasGenres || !storedHasGenres) {
				this.logger?.info(NoticeUpdateAsin(this.asin, 'book'))
				// Update
				return this.update()
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
			const set = {
				...this.bookData,
				createdAt: found.data._id.getTimestamp()
			}
			// The preservation merge above may have copied the stored genres
			// into a genre-less incoming book; that copy is evidence for the
			// safeguard, not a write. A genre-less update must never carry
			// `genres` into the `$set`: a concurrent genre refresh that lands
			// on the row during this update's awaited lookups would be
			// clobbered by the copied value. The equality path never
			// reaches the write, so an omitted genre-less payload is safe.
			if (!this.incomingHadGenres) delete set.genres
			await BookModel.updateOne(
				{
					asin: this.asin,
					$or: [{ region: { $exists: false } }, { region: this.options.region }]
				},
				{
					$set: set,
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
