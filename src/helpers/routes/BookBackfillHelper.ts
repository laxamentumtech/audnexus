import type { FastifyBaseLogger } from 'fastify'

import BookModel from '#config/models/Book'
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
	 */
	async process(): Promise<BackfillResult> {
		const books = await BookModel.find(
			{ ratings: { $exists: false } },
			{ projection: { asin: 1, region: 1 }, sort: { updatedAt: -1 }, allowDiskUse: true }
		)
		this.logger.info(NoticeUpdateScheduled('Ratings backfill'))
		let skipped = 0
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
		// Pre-order books count as a batch success but are not persisted,
		// so they are reported as skipped, not updated.
		return {
			total: summary.total,
			updated: summary.success - skipped,
			skipped,
			failed: summary.failures
		}
	}
}
