import type { FastifyBaseLogger } from 'fastify'

import BookModel, { BookDocument } from '#config/models/Book'
import { ApiBook, ApiBookSchema, ApiQueryString } from '#config/types'
import { isBookDocument } from '#config/typing/checkers'
import { PaprBookDocumentReturn, PaprBookReturn, PaprDeleteReturn } from '#config/typing/papr'
import { buildEffectiveWrite, buildEvidenceOnlyWrite } from '#helpers/database/bookWriteProjection'
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
		// A SINGLE raw read feeds both the parsed projection and the
		// `_id` the conditional marker-unset below targets (a region-less
		// sibling row must not be unset by a region-scoped equality
		// comparison). Two reads could diverge when the matched book is
		// deleted between them, leaving the unset filter's `_id`
		// undefined — and with `ignoreUndefined: true` an undefined
		// filter key matches an arbitrary marked row.
		const rawRow = await this.findOne()
		const rowId = rawRow.data?._id
		// Parse the raw row to ensure it's the correct type and remove
		// any extra fields
		const dataParsed = ApiBookSchema.safeParse(rawRow.data)
		// Assign data to variable if it's valid, otherwise assign null
		const data = dataParsed.success ? dataParsed.data : null

		// Update
		if (this.options.update === '1' && data) {
			const { book: effective } = buildEffectiveWrite(data, this.bookData, {})
			// If the effective write is the exact same row return right away
			const isEqual = this.sharedHelper.isEqualData(data, effective)
			if (isEqual) {
				// An equal accepted refresh supersedes a backfill skip
				// decision: a row marked non-book that keeps refreshing as a
				// book must leave the marker behind. Conditional, so the
				// no-write fast path costs nothing when no marker exists.
				// Without an `_id` the filter key would drop out under
				// `ignoreUndefined: true` and match an arbitrary marked
				// row, so skip the cleanup entirely.
				if (rowId) {
					await BookModel.updateOne(
						{
							_id: rowId,
							ratingsBackfillSkip: { $exists: true }
						},
						{ $unset: { ratingsBackfillSkip: '' } }
					)
				}
				return {
					data: data,
					modified: false
				}
			}
			this.logger?.info(NoticeUpdateAsin(this.asin, 'book'))
			// update() writes only the incoming evidence (its $set omits
			// fields the incoming book has no value for), so a concurrent
			// refresh that lands between this read and the write is not
			// restored from a stale snapshot.
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
			// Write only the incoming evidence: fields the incoming book has
			// no value for are left out of the $set, so MongoDB leaves the
			// stored row's retained fields (stored genres on a genre-less
			// refresh, stored series) untouched. Writing
			// those stored values back from a snapshot is the race this
			// update used to carry: a concurrent refresh that committed
			// between the read and the write was restored from the stale
			// snapshot. The equality check in createOrUpdate() already
			// uses the full effective write, so the short-circuit is
			// unchanged.
			const evidence = buildEvidenceOnlyWrite(this.bookData)
			// Write the OBSERVED rating fields as a pipeline MERGE against
			// the stored `ratings` object: a concurrent Goodreads change is
			// not clobbered and a concurrent addition is not erased when
			// this read saw none. A legacy row whose stored `ratings` is
			// `null` or a scalar (a malformed parent a dotted-path `ratings.*`
			// $set cannot address) is treated as empty, so the merge repairs
			// it — the same outcome the old whole-object $set produced.
			const incomingRatings = evidence.ratings as Record<string, unknown> | undefined
			if (incomingRatings) {
				delete evidence.ratings
				const ratingsMerge: Record<string, unknown> = {}
				for (const [field, value] of Object.entries(incomingRatings)) {
					if (value === undefined) continue
					ratingsMerge[field] = value
				}
				// The papr model type omits the pipeline-update overload;
				// the runtime model has it (UpdateScheduler.markChecked
				// relies on the same).
				const bookModel = BookModel as unknown as {
					updateOne: (
						filter: Record<string, unknown>,
						update: Record<string, unknown> | Record<string, unknown>[],
						options?: Record<string, unknown>
					) => Promise<unknown>
				}
				// A single aggregation-pipeline update: the pipeline form
				// (not a dotted path) tolerates a non-object `ratings`
				// parent (`$cond` treats it as empty), and the merge keeps
				// every stored sub-field the incoming ratings omit.
				// The evidence values are plain catalog data, never
				// aggregation expressions: a `$`-prefixed string (a title, a
				// tag name) would be read as a field path by the pipeline,
				// so every incoming value is stored as a literal.
				const evidenceLiterals: Record<string, unknown> = {}
				for (const [field, value] of Object.entries(evidence)) {
					evidenceLiterals[field] = { $literal: value }
				}
				await bookModel.updateOne(
					{
						asin: this.asin,
						$or: [{ region: { $exists: false } }, { region: this.options.region }]
					},
					[
						{
							$set: {
								...evidenceLiterals,
								ratings: {
									$mergeObjects: [
										{
											$cond: [{ $eq: [{ $type: '$ratings' }, 'object'] }, '$ratings', {}]
										},
										ratingsMerge
									]
								},
								createdAt: found.data._id.getTimestamp(),
								// The driver computes the current timestamp:
								// `$currentDate` is an update operator, not a
								// pipeline stage, so the pipeline form $sets
								// a literal date (the same approach
								// BookHistoryStore uses for pipeline
								// timestamp writes).
								updatedAt: new Date()
							}
						},
						// An accepted book write supersedes a backfill skip
						// decision (e.g. upstream now reports a real book).
						{ $unset: ['ratingsBackfillSkip'] }
					]
				)
			} else {
				await BookModel.updateOne(
					{
						asin: this.asin,
						$or: [{ region: { $exists: false } }, { region: this.options.region }]
					},
					{
						$set: { ...evidence, createdAt: found.data._id.getTimestamp() },
						// An accepted book write supersedes a backfill skip
						// decision (e.g. upstream now reports a real book).
						$unset: { ratingsBackfillSkip: '' },
						$currentDate: { updatedAt: true }
					}
				)
			}
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
