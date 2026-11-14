import type { FastifyRedis } from '@fastify/redis'
import type { FastifyBaseLogger } from 'fastify'
import type { Redis } from 'ioredis'

import { isBookHistoryEnabled } from '#config/bookHistory'
import BookModel from '#config/models/Book'
import { bookHistoryStore } from '#config/papr'
import { getPerformanceConfig } from '#config/performance'
import type { ApiAuthorProfile, ApiBook, ApiChapter } from '#config/types'
import {
	fetchProductsByAsin,
	type PrefetchedApiProduct
} from '#helpers/books/audible/ApiBatchHelper'
import { ContentTypeMismatchError } from '#helpers/errors/ApiErrors'
import BookShowHelper from '#helpers/routes/BookShowHelper'
import { registerSuccess, sleepCooldown } from '#helpers/utils/adaptiveCooldown'
import { processBatchByRegion } from '#helpers/utils/batchProcessor'
import { jitteredSleep } from '#helpers/utils/jitteredSleep'
import {
	ASIN_REGION_PROJECTION,
	DocumentWithRegion,
	iterateKeyset,
	keysetFindAdapter
} from '#helpers/utils/keyset'
import { withDeadline } from '#helpers/utils/withDeadline'
import { NoticeUpdateScheduled } from '#static/messages'

/** Per-request ASIN cap for the undocumented multi-ASIN endpoint. */
const MAX_BULK_ASINS = 50

/**
 * Read `AUDIBLE_BATCH_SIZE`. Unset or < 2 keeps the proven per-book path;
 * values above the endpoint cap are clamped. Batching is opt-in so a
 * deployment can measure it before making it the default.
 */
function bulkBatchSize(): number {
	const raw = Number(process.env.AUDIBLE_BATCH_SIZE)
	if (!Number.isFinite(raw) || raw < 2) return 1
	return Math.min(Math.floor(raw), MAX_BULK_ASINS)
}

interface BackfillResult {
	total: number
	updated: number
	skipped: number
	terminalSkipped: number
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
	/**
	 * Persist the terminal non-book marker with a conditional update: only a
	 * row that still lacks ratings and is not yet marked is touched, and the
	 * write is skipped rather than overwritten when another writer won. The
	 * pipeline also backfills `createdAt` from the ObjectId timestamp so the
	 * row keeps a sane timestamp for a later full write.
	 *
	 * Document validation is bypassed deliberately: the target rows are
	 * legacy stubs that already lack validator-required content fields
	 * (authors, description, releaseDate, ...), so a metadata-only update
	 * would be rejected for unrelated missing data that this operation does
	 * not touch. Content writes keep full validation.
	 * @returns true when this call wrote the marker
	 */
	private async markNonBook(id: DocumentWithRegion['_id'], contentType: string): Promise<boolean> {
		const result = await BookModel.collection.updateOne(
			{
				_id: id,
				ratings: { $exists: false },
				ratingsBackfillSkip: { $exists: false }
			},
			[
				{
					$set: {
						createdAt: { $ifNull: ['$createdAt', { $toDate: '$_id' }] },
						ratingsBackfillSkip: {
							reason: 'non_book',
							contentType,
							markedAt: new Date()
						}
					}
				}
			],
			{ bypassDocumentValidation: true }
		)
		return result.modifiedCount === 1
	}

	async process(): Promise<BackfillResult> {
		const batchSize = getPerformanceConfig().SCHEDULER_BATCH_SIZE
		let total = 0
		let updated = 0
		let skipped = 0
		let terminalSkipped = 0
		let raced = 0
		let failed = 0

		this.logger.info(NoticeUpdateScheduled('Ratings backfill'))
		await iterateKeyset(
			keysetFindAdapter(BookModel),
			{
				projection: ASIN_REGION_PROJECTION,
				baseFilter: {
					ratings: { $exists: false },
					// Rows marked by an earlier pass are intentionally excluded:
					// their upstream content type can never yield book ratings.
					ratingsBackfillSkip: { $exists: false },
					// `rating: "0.0"` means upstream has no ratings: there is no
					// distribution payload to fetch, so re-selecting those rows on
					// every pass only burns requests (400k of them on the live DB).
					// A book that later gains ratings changes `rating` away from 0.0
					// and re-enters this walk.
					rating: { $nin: ['0.0', '0'] }
				},
				batchSize
			},
			async (books) => {
				// Optional multi-ASIN prefetch: one request per 50 books instead of
				// one per book. Stubs/failed chunks fall back to the per-book path
				// (undefined prefetched), so failure classification is unchanged.
				const prefetched = new Map<string, PrefetchedApiProduct>()
				const reservedGenerations = new Map<string, number>()
				const batchSize = bulkBatchSize()
				if (batchSize > 1) {
					const byRegion = new Map<string, typeof books>()
					for (const book of books) {
						const region = book.region ?? 'us'
						const list = byRegion.get(region) ?? []
						list.push(book)
						byRegion.set(region, list)
					}
					const historyEnabled = isBookHistoryEnabled()
					let chunks = 0
					let failures = 0
					let stubs = 0
					// A failed chunk means the endpoint is unhealthy for this page;
					// stop probing and let the proven per-book path carry the rest.
					let disabled = false
					for (const [region, regionBooks] of byRegion) {
						for (let i = 0; i < regionBooks.length && !disabled; i += batchSize) {
							const chunk = regionBooks.slice(i, i + batchSize)
							const keys = chunk.map((book) => `${region}:${book.asin}`)
							if (historyEnabled) {
								// Reserve before the fetch so a concurrent refresh cannot
								// win the generation fence with a later start time.
								for (let k = 0; k < chunk.length; k += 1) {
									try {
										reservedGenerations.set(
											keys[k],
											await bookHistoryStore.reserveGeneration(chunk[k].asin, region)
										)
									} catch (error) {
										this.logger.debug(
											`[AUDIBLE BATCH] generation not reserved for ${keys[k]}: ${error instanceof Error ? error.message : error}`
										)
									}
								}
							}
							await sleepCooldown()
							try {
								const result = await fetchProductsByAsin(
									chunk.map((b) => b.asin),
									region,
									this.logger
								)
								chunks += 1
								stubs += result.stubs.size
								// One upstream success signal per accepted batch request,
								// at request time: consuming pre-throttle data later must
								// not relax a cooldown raised in between.
								if (result.found.size > 0) registerSuccess()
								for (const [asin, product] of result.found) {
									const key = `${region}:${asin}`
									// A prefetched product may only be consumed when its
									// generation was reserved before this fetch; otherwise
									// persistence would reserve after the fact and could
									// accept a stale snapshot. Unreserved ASINs fall back to
									// the single path, which reserves before its own fetch.
									if (!historyEnabled || reservedGenerations.has(key)) {
										prefetched.set(key, product)
									}
								}
							} catch (error) {
								failures += 1
								disabled = true
								this.logger.warn(
									`[AUDIBLE BATCH] ${region}: disabling batching for this page after ${chunk.length} books: ${error instanceof Error ? error.message : error}`
								)
								await sleepCooldown()
							}
						}
					}
					if (chunks > 0 || failures > 0) {
						this.logger.info(
							`[AUDIBLE BATCH] chunks=${chunks} prefetched=${prefetched.size} stubs=${stubs} failures=${failures}`
						)
					}
				}

				const { summary } = await processBatchByRegion(books, async (book) => {
					const region = book.region ?? 'us'
					const helper = new BookShowHelper(
						book.asin,
						{ region, update: '1' },
						this.redis as unknown as FastifyRedis | null,
						this.logger,
						true,
						// Ratings come from the API; the product page only adds
						// genres and would cost a 404/503 round trip per row.
						true,
						prefetched.get(`${region}:${book.asin}`),
						reservedGenerations.get(`${region}:${book.asin}`)
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
					} catch (error) {
						// Terminal content-type rejection (comic/bundle/podcast):
						// no book fetch will ever produce ratings for this row.
						// Mark it so the keyset stops re-walking it; every other
						// failure stays retryable.
						if (error instanceof ContentTypeMismatchError) {
							const contentType = error.details?.actualType
							if (contentType) {
								const marked = await this.markNonBook(book._id, contentType)
								if (marked) {
									terminalSkipped += 1
									this.logger.info(
										`Ratings backfill: marked ${book.asin} as non-book (${contentType})`
									)
								} else {
									// Raced with another write (already rated or
									// already marked): nothing left to do here.
									raced += 1
								}
								return
							}
						}
						throw error
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
						if (!prefetched.get(`${region}:${book.asin}`)) registerSuccess()
						return
					}
					// The returned data can be the stored row: when the store
					// declines the full-document update (stale generation,
					// equal-projection short-circuit, or a guard rejection) the
					// handler resolves with the old record, which may predate
					// the ratings field. The validated block from the fresh
					// fetch (helper.freshData) is still usable, so prefer the
					// returned ratings and fall back to the fresh ones.
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
							updateOne: (filter: object, update: object, options?: object) => Promise<unknown>
						}
						// The repair is a targeted field addition on legacy stubs
						// that already fail the validator for unrelated missing
						// content fields, so bypass validation here (content
						// writes keep full validation) — otherwise the row can
						// never leave the target set.
						await bookModel.updateOne(
							{ _id: book._id },
							{
								$set: { ratings },
								$unset: { ratingsBackfillSkip: '' },
								$currentDate: { updatedAt: true }
							},
							{ bypassDocumentValidation: true }
						)
					}
					// Got a fully-formed book with ratings: the only usable-success
					// signal, so this (not a bare 200) relaxes the cooldown. Batch
					// requests already registered one success at fetch time.
					if (!prefetched.get(`${region}:${book.asin}`)) registerSuccess()
				})
				total += summary.total
				updated += summary.success
				failed += summary.failures
				this.logger.debug(
					`Ratings backfill batch: total=${total} updated=${updated} skipped=${skipped} terminal=${terminalSkipped} failed=${failed} lastId=${books[books.length - 1]._id}`
				)
			}
		)
		// Pre-order books, terminal non-book marks, and races count as batch
		// successes but are not ratings completions.
		return {
			total,
			updated: updated - skipped - terminalSkipped - raced,
			skipped,
			terminalSkipped,
			failed
		}
	}
}
