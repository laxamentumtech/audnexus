import type { FastifyBaseLogger } from 'fastify'
import type { ObjectId } from 'mongodb'
import type { ProjectionType } from 'papr'

import BookModel, { type BookDocument } from '#config/models/Book'
import { getPerformanceConfig } from '#config/performance'
import BookShowHelper from '#helpers/routes/BookShowHelper'
import { processBatchByRegion } from '#helpers/utils/batchProcessor'
import { NoticeUpdateScheduled } from '#static/messages'

interface BackfillResult {
	total: number
	updated: number
	skipped: number
	failed: number
}

export default class BookBackfillHelper {
	logger: FastifyBaseLogger
	constructor(logger: FastifyBaseLogger) {
		this.logger = logger
	}

	/**
	 * Re-fetches every book document that lacks the `ratings` field,
	 * using the same update path as the scheduled updates.
	 *
	 * forceUpdate is set so the recency gate does not skip recently-updated
	 * books — the backfill targets books missing `ratings` regardless of
	 * their `updatedAt`.
	 *
	 * Pre-order books are reported as `skipped`: GenericShowHelper returns
	 * their fresh data transiently without persisting while a stored record
	 * exists, so counting them as `updated` would re-select them forever.
	 *
	 * Books are walked in `_id`-ordered batches so memory stays bounded to one
	 * batch even on multi-million-document collections.
	 */
	async process(): Promise<BackfillResult> {
		const batchSize = getPerformanceConfig().SCHEDULER_BATCH_SIZE
		const projection = { asin: 1, region: 1 }
		type BatchBook = ProjectionType<BookDocument, typeof projection>
		let lastId: ObjectId | null = null
		let total = 0
		let updated = 0
		let skipped = 0
		let failed = 0

		this.logger.info(NoticeUpdateScheduled('Ratings backfill'))
		while (true) {
			const books: BatchBook[] = await BookModel.find(
				lastId
					? { ratings: { $exists: false }, _id: { $gt: lastId } }
					: { ratings: { $exists: false } },
				{ projection, sort: { _id: 1 }, limit: batchSize }
			)
			if (books.length === 0) break

			const { summary } = await processBatchByRegion(books, async (book) => {
				const helper = new BookShowHelper(
					book.asin,
					{ region: book.region ?? 'us', update: '1' },
					null,
					this.logger,
					true
				)
				const updatedBook = await helper.handler()
				if (!updatedBook || !('ratings' in updatedBook && updatedBook.ratings)) {
					throw new Error(`Ratings were not populated for ${book.asin}`)
				}
				// A releaseDate in the future means the refreshed data was returned
				// transiently (not persisted) by the pre-order path — same definition
				// as GenericShowHelper.isPreOrder.
				if ('releaseDate' in updatedBook && updatedBook.releaseDate > new Date()) {
					skipped += 1
				}
			})
			total += summary.total
			updated += summary.success
			failed += summary.failures
			lastId = books[books.length - 1]._id
			this.logger.debug(
				`Ratings backfill batch: total=${total} updated=${updated} skipped=${skipped} failed=${failed} lastId=${lastId}`
			)
		}
		// Pre-order books count as a batch success but are not persisted,
		// so they are reported as skipped, not updated.
		return { total, updated: updated - skipped, skipped, failed }
	}
}
