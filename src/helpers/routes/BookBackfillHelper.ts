import type { FastifyRedis } from '@fastify/redis'
import type { FastifyBaseLogger } from 'fastify'
import type { Redis } from 'ioredis'

import BookModel from '#config/models/Book'
import { getPerformanceConfig } from '#config/performance'
import type { ApiAuthorProfile, ApiBook, ApiChapter } from '#config/types'
import BookShowHelper from '#helpers/routes/BookShowHelper'
import { registerSuccess, sleepCooldown } from '#helpers/utils/adaptiveCooldown'
import { processBatchByRegion } from '#helpers/utils/batchProcessor'
import { jitteredSleep } from '#helpers/utils/jitteredSleep'
import { ASIN_REGION_PROJECTION, iterateKeyset, keysetFindAdapter } from '#helpers/utils/keyset'
import { withDeadline } from '#helpers/utils/withDeadline'
import { NoticeUpdateScheduled } from '#static/messages'

interface BackfillResult {
	total: number
	updated: number
	skipped: number
	failed: number
}

export default class BookBackfillHelper {
	logger: FastifyBaseLogger
	redis: Redis | null
	constructor(logger: FastifyBaseLogger, redis: Redis | null = null) {
		this.logger = logger
		this.redis = redis
	}

	/**
	 * Re-fetches every book document that lacks the `ratings` field,
	 * using the same update path as the scheduled updates.
	 *
	 * forceUpdate is set so the recency gate does not skip recently-updated
	 * books — the backfill targets books missing `ratings` regardless of
	 * their `updatedAt`.
	 *
	 * Pre-order books are reported as `skipped` (checked before the ratings
	 * gate, so a pre-order with no upstream rating data is still skipped, not
	 * failed): GenericShowHelper returns their fresh data transiently without
	 * persisting while a stored record exists, so counting them as `updated`
	 * would re-select them forever. Non-pre-order books whose refreshed data
	 * lacks ratings fail the ratings check and count `failed`.
	 *
	 * Books are walked in `_id`-ordered batches so memory stays bounded to one
	 * batch even on multi-million-document collections.
	 */
	async process(): Promise<BackfillResult> {
		const batchSize = getPerformanceConfig().SCHEDULER_BATCH_SIZE
		let total = 0
		let updated = 0
		let skipped = 0
		let failed = 0

		this.logger.info(NoticeUpdateScheduled('Ratings backfill'))
		await iterateKeyset(
			keysetFindAdapter(BookModel),
			{
				projection: ASIN_REGION_PROJECTION,
				baseFilter: { ratings: { $exists: false } },
				batchSize
			},
			async (books) => {
				const { summary } = await processBatchByRegion(books, async (book) => {
					const helper = new BookShowHelper(
						book.asin,
						{ region: book.region ?? 'us', update: '1' },
						this.redis as unknown as FastifyRedis | null,
						this.logger,
						true
					)
					let updatedBook: ApiAuthorProfile | ApiBook | ApiChapter | undefined
					try {
						// Same hard per-item deadline as the scheduler walk: a hung
						// fetch must surface as a failure, not park the worker.
						updatedBook = await withDeadline(
							helper.handler(),
							getPerformanceConfig().SCHEDULER_ITEM_TIMEOUT_MS,
							`backfill book ${book.asin}`
						)
					} finally {
						// Serial pacing, same ladder as the scheduler walk: the
						// backfill used to run unjittered and drew 503s within
						// seconds, driving the shared adaptive cooldown to its
						// 7200 s ceiling and stalling every pass on the worker.
						// Jitter first, then the cooldown — and in the finally so
						// a rejected book still paces the next one.
						await jitteredSleep()
						// Adaptive upstream-pressure cooldown (see
						// adaptiveCooldown.ts): the backfill shares the
						// worker's single upstream reputation, so it must
						// honor the same growth/decay ladder as the
						// scheduler walk instead of grinding at full speed.
						// In the finally so a rejected book still paces the
						// next one.
						await sleepCooldown()
					}
					// Pre-order first: a future releaseDate means the refreshed
					// data is transient (not persisted) by
					// GenericShowHelper.isPreOrder, so it is reported skipped —
					// counting it as updated would be false, and a pre-order
					// with no upstream rating data must NOT count failed.
					// Checked before the ratings gate on purpose; a future
					// releaseDate can only appear on the fresh transient data
					// (pre-orders are never persisted, so a stored record
					// returned by the REGION_UNAVAILABLE/PRODUCT_DELISTED
					// fallback always carries a past releaseDate).
					if (updatedBook && 'releaseDate' in updatedBook && updatedBook.releaseDate > new Date()) {
						skipped += 1
						registerSuccess()
						return
					}
					// The returned data can be the stored row: when the fresh
					// data has no genre evidence, BookHistoryStore's
					// genre safeguard rejects the full-document update and the
					// handler resolves with the old record, which predates the
					// ratings field. The validated block from the fresh fetch
					// (helper.freshData) is still usable, so prefer the returned
					// ratings and fall back to the fresh ones.
					const returnedRatings =
						updatedBook && 'ratings' in updatedBook ? updatedBook.ratings : undefined
					const freshRatings =
						helper.freshData && 'ratings' in helper.freshData ? helper.freshData.ratings : undefined
					const ratings = returnedRatings ?? freshRatings
					if (!ratings) {
						throw new Error(`Ratings were not populated for ${book.asin}`)
					}
					// Write the ratings block directly when the handler could
					// not persist: the genre guard exists to stop genre-nuking
					// updates, not to block a pure field addition, and without
					// this the row never leaves the `ratings: {$exists: false}`
					// target set.
					if (!helper.persisted) {
						// papr's model type omits updateOne; the runtime model
						// has it (UpdateScheduler.markChecked relies on the same).
						const bookModel = BookModel as unknown as {
							updateOne: (filter: object, update: object) => Promise<unknown>
						}
						await bookModel.updateOne(
							{ _id: book._id },
							{
								$set: { ratings },
								$currentDate: { updatedAt: true }
							}
						)
					}
					// Got a fully-formed book with ratings: the only usable-success
					// signal, so this (not a bare 200) relaxes the cooldown.
					registerSuccess()
				})
				total += summary.total
				updated += summary.success
				failed += summary.failures
				this.logger.debug(
					`Ratings backfill batch: total=${total} updated=${updated} skipped=${skipped} failed=${failed} lastId=${books[books.length - 1]._id}`
				)
			}
		)
		// Pre-order books count as a batch success but are not persisted,
		// so they are reported as skipped, not updated.
		return { total, updated: updated - skipped, skipped, failed }
	}
}
