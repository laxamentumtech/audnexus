import type { FastifyBaseLogger } from 'fastify'

import BookModel from '#config/models/Book'
import BookShowHelper from '#helpers/routes/BookShowHelper'
import { processBatchByRegion } from '#helpers/utils/batchProcessor'
import { NoticeUpdateScheduled } from '#static/messages'

interface BackfillResult {
	total: number
	updated: number
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
	 */
	async process(): Promise<BackfillResult> {
		const books = await BookModel.find(
			{ ratings: { $exists: false } },
			{ projection: { asin: 1, region: 1 }, sort: { updatedAt: -1 }, allowDiskUse: true }
		)
		this.logger.info(NoticeUpdateScheduled('Ratings backfill'))
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
		})
		return { total: summary.total, updated: summary.success, failed: summary.failures }
	}
}
