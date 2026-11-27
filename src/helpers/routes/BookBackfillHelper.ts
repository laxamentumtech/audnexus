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
import type { RatingsRepairResult } from '#helpers/database/papr/BookHistoryStore'
import RedisHelper from '#helpers/database/redis/RedisHelper'
import { ContentTypeMismatchError, NotFoundError } from '#helpers/errors/ApiErrors'
import BookShowHelper from '#helpers/routes/BookShowHelper'
import { registerSuccess, sleepCooldown } from '#helpers/utils/adaptiveCooldown'
import { processBatchByRegion } from '#helpers/utils/batchProcessor'
import { isDocumentValidationError } from '#helpers/utils/documentValidationError'
import { jitteredSleep } from '#helpers/utils/jitteredSleep'
import {
	ASIN_REGION_PROJECTION,
	DocumentWithRegion,
	iterateKeyset,
	keysetFindAdapter
} from '#helpers/utils/keyset'
import { DeadlineExceededError, withDeadline } from '#helpers/utils/withDeadline'
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
	 *
	 * The history-enabled path fences this write inside
	 * `bookHistoryStore.markNonBook` (the fence predicate is part of the
	 * same transaction as the marker write); this unfenced variant serves
	 * history-disabled deployments and rows with no reserved generation,
	 * where nothing can advance the watermarks.
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
					// Rows with no persisted `rating` and rows with an
					// explicit `0.0`/`0` are both excluded from the ratings
					// walk: `0.0` means upstream has no ratings, so there is
					// no distribution payload to fetch, and re-selecting
					// those rows on every pass only burns requests (400k of
					// them on the live DB). A book that later gains a rating
					// re-enters this walk. The `$exists` guard is required:
					// `$nin` alone also matches a MISSING `rating` field, so
					// without it a refresh that persisted `rating` (even
					// "0.0" for a book upstream reports as unrated) would be
					// reselected forever.
					rating: { $exists: true, $nin: ['0.0', '0'] }
				},
				batchSize
			},
			async (books) => {
				// Optional multi-ASIN prefetch: one request per 50 books instead of
				// one per book. Stubs/failed chunks fall back to the per-book path
				// (undefined prefetched), so failure classification is unchanged.
				const prefetched = new Map<string, PrefetchedApiProduct>()
				// The snapshot generation that authorized each prefetched
				// product: read from the pre-fetch snapshot (not the live
				// map) so a later chunk's reservation cannot overwrite the
				// generation that an earlier product was fetched under.
				const prefetchedGenerations = new Map<string, number>()
				// ASINs per upstream request (AUDIBLE_BATCH_SIZE) — distinct
				// from the outer page-size `batchSize` (SCHEDULER_BATCH_SIZE
				// rows per keyset page).
				const asinsPerRequest = bulkBatchSize()
				if (asinsPerRequest > 1) {
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
						// Set before each chunk (below) and read only in the
						// failure diagnostic: the offset where the current chunk
						// starts in the region page.
						let pageOffset: number
						for (let i = 0; i < regionBooks.length && !disabled; i += asinsPerRequest) {
							// Advance the offset as chunks are processed (not only
							// on failure): a chunk that fails after successful
							// chunks must report the real progress — where it
							// starts in the region page — not a frozen 0.
							pageOffset = i
							const chunk = regionBooks.slice(i, i + asinsPerRequest)
							const keys = chunk.map((book) => `${region}:${book.asin}`)
							// Snapshot of the reservations as of the start of
							// this chunk's fetch: only entries present here
							// may authorize this chunk's prefetched results.
							let reservedBeforeFetch: Map<string, number> | null = null
							if (historyEnabled) {
								// Reserve before the fetch so a concurrent refresh cannot
								// win the generation fence with a later start time.
								// The reservations are sequential DB round-trips (up to
								// `asinsPerRequest` of them), so bound the phase under
								// the same per-item deadline as the fetch: a slow
								// reservation run must not park the worker for
								// `chunk.length` × transaction time. An ASIN whose
								// reservation did not complete stays unreserved and
								// falls back to the per-book path, which reserves
								// before its own fetch.
								// The deadline stops AWAITING, not the loop: without
								// this flag the inner run keeps issuing reservations
								// after the fetch starts, and a late one could then
								// authorize an already-started batch.
								let reservationStopped = false
								// Successful reservations made BY THIS CHUNK: the
								// pre-fetch snapshot is built from this map
								// alone, so a reservation from an earlier
								// chunk (a key that repeats across chunks) can
								// neither authorize this chunk's results nor
								// keep a fully-failed chunk from skipping.
								const chunkReservations = new Map<string, number>()
								await withDeadline(
									(async () => {
										for (let k = 0; k < chunk.length && !reservationStopped; k += 1) {
											try {
												chunkReservations.set(
													keys[k],
													await bookHistoryStore.reserveGeneration(chunk[k].asin, region)
												)
											} catch (error) {
												this.logger.debug(
													`[AUDIBLE BATCH] generation not reserved for ${keys[k]}: ${error instanceof Error ? error.message : error}`
												)
											}
										}
									})(),
									getPerformanceConfig().SCHEDULER_ITEM_TIMEOUT_MS,
									`batch generation reservations ${region} (${chunk.length} ASINs)`,
									() => {
										reservationStopped = true
									}
								).catch(() => {
									this.logger.warn(
										`[AUDIBLE BATCH] ${region}: generation reservation deadline exceeded; unreserved ASINs fall back to the per-book path`
									)
								})
								// Snapshot taken after the deadline settles the
								// await: only THIS CHUNK's reservations that
								// completed BEFORE this fetch are eligible for
								// its results — a late completion must not
								// authorize an already-started batch, and an
								// earlier chunk's reservation for a repeated
								// key must not stand in for one that failed
								// here.
								reservedBeforeFetch = new Map(chunkReservations)
							}
							// Pacing at the batch REQUEST boundary, not only per
							// book after the fact: with the cooldown at zero the
							// batch chunks would otherwise fire back-to-back,
							// bursting into upstream 503s exactly like the
							// unjittered per-book walk did.
							// Skip the batch request entirely when none of the
							// chunk's keys were reserved before the fetch:
							// every product the endpoint returns would be
							// dropped by the reservation check below, and the
							// per-book path (which reserves before its own
							// fetch) carries the chunk with one request per
							// book. A batch that reserved at least one key
							// still runs — unreserved ASINs in the same
							// chunk fall back per book.
							if (historyEnabled && reservedBeforeFetch?.size === 0) {
								this.logger.debug(
									`[AUDIBLE BATCH] ${region}: no keys reserved before fetch; skipping batch for ${chunk.length} ASINs (per-book fallback)`
								)
								continue
							}
							await jitteredSleep()
							await sleepCooldown()
							try {
								// Same hard per-item deadline as the per-book path:
								// axios timeouts do not bound a trickling
								// multi-retry response, so a stuck prefetch must
								// surface as a failed chunk (disable batching for
								// the page; the per-book path carries the rest),
								// not park the single-concurrency worker.
								const controller = new AbortController()
								const result = await withDeadline(
									fetchProductsByAsin(
										chunk.map((b) => b.asin),
										region,
										this.logger,
										controller.signal
									),
									getPerformanceConfig().SCHEDULER_ITEM_TIMEOUT_MS,
									`batch prefetch ${region} (${chunk.length} ASINs)`,
									() => controller.abort()
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
									// The pre-fetch snapshot (not the live map) decides:
									// a reservation that completes late must not
									// authorize this batch's results.
									if (!historyEnabled || reservedBeforeFetch?.has(key)) {
										prefetched.set(key, product)
										// Publish the product TOGETHER with the
										// snapshot generation that authorized
										// it: the live map can be overwritten by
										// a later chunk's reservation for the
										// same key, and dispatch must not accept
										// this (earlier) product under a
										// generation reserved after it was
										// fetched.
										const snapshotGeneration = reservedBeforeFetch?.get(key)
										if (snapshotGeneration !== undefined) {
											prefetchedGenerations.set(key, snapshotGeneration)
										}
									}
								}
							} catch (error) {
								failures += 1
								disabled = true
								// fetchPlus rejects exhausted HTTP failures with
								// the AxiosResponse DIRECTLY (status/config at
								// top level) and transport failures with an
								// AxiosError (status/config nested under
								// `.response`); stringifying either yields
								// "[object Object]" and hides a 400 (ASIN
								// list/cap) from a 503 (throttle). Read the
								// status/URL the way ApiHelper.fetchBook does
								// (top level first), falling back to the
								// error's own text.
								const reason = error as {
									status?: number
									config?: { url?: string }
									response?: { status?: number; config?: { url?: string } }
									message?: string
									stack?: string
								}
								const status = reason?.status ?? reason?.response?.status
								const url = reason?.config?.url ?? reason?.response?.config?.url
								const detail =
									typeof status === 'number'
										? `HTTP ${status}${url ? ` for ${url}` : ''}`
										: (reason?.message ?? reason?.stack ?? String(error))
								this.logger.warn(
									`[AUDIBLE BATCH] ${region}: disabling batching for this page at offset ${pageOffset} (${chunk.length} books in chunk): ${detail}`
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
					const bookPrefetchedKey = `${region}:${book.asin}`
					const helper = new BookShowHelper(
						book.asin,
						{ region, update: '1' },
						this.redis as unknown as FastifyRedis | null,
						{
							logger: this.logger,
							forceUpdate: true,
							// Ratings come from the API; the product page only
							// adds genres and would cost a 404/503 round trip
							// per row.
							skipHtml: true,
							prefetched: prefetched.get(bookPrefetchedKey),
							// Only a CONSUMED prefetched product may reuse the
							// batch's pre-reserved generation: the reservation
							// ordered the fence by the batch fetch's start. A
							// stub/failed-chunk ASIN falls back to the
							// per-book fetch, which must reserve its OWN
							// generation before its fetch (the GenericShowHelper
							// `?? reserveGeneration` path) — forwarding the
							// batch generation would mark a fallback write stale
							// whenever a concurrent refresh accepted a newer
							// generation, dropping its ratings. The SNAPSHOT
							// generation (not the live map) is the single source
							// for both admission and dispatch: a reservation
							// that completes after the snapshot must not
							// re-authorize an already-fetched product.
							reservedGeneration: prefetched.has(bookPrefetchedKey)
								? prefetchedGenerations.get(bookPrefetchedKey)
								: undefined
						}
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
								// Generation fence for the marker write (the
								// persistence path's same fence, applied to
								// the marker): a batch result can be stale by
								// the time it is consumed, and a stale result
								// must not mark the ASIN terminal after a
								// newer refresh accepted it as a book.
								// `persistedGeneration` is undefined when the
								// fetch failed before persistence ran, so fall
								// back to the generation the fetch was
								// RESERVED under (exposed on the helper: the
								// batch's pre-reserved generation, or the
								// on-the-fly reservation the per-book path
								// made before its own fetch). Without a
								// reserved generation there is nothing to
								// fence the marker against — a stale marker
								// after a newer refresh would wrongly mark
								// the ASIN terminal — so skip the marker and
								// count a race (the row stays in the target
								// set, retried on the next pass).
								const generation = helper.persistedGeneration ?? helper.reservedGeneration
								let marked: boolean
								if (isBookHistoryEnabled() && generation !== undefined) {
									// The fence predicate is carried into the
									// SAME transaction as the marker write
									// (`bookHistoryStore.markNonBook`): a
									// separate superseded-check read proved
									// non-staleness only while that read ran,
									// so a newer refresh accepted in between
									// would still let the book be marked
									// terminal.
									const result = await bookHistoryStore.markNonBook({
										asin: book.asin,
										region,
										generation,
										bookId: book._id,
										contentType
									})
									if (result.superseded) {
										raced += 1
										return
									}
									marked = result.modified === 1
								} else if (isBookHistoryEnabled()) {
									raced += 1
									return
								} else {
									marked = await this.markNonBook(book._id, contentType)
								}
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
						// A book deleted AFTER the keyset page read but before
						// persistObservation completes returns `stale` with no
						// data, and the show handler throws a NotFoundError
						// for it (`Book <asin> not found in region <region>`).
						// That is a concurrent-delete race, not a retryable
						// failure: the row is gone, so tally it into `raced`
						// (subtracted from `updated` at the end) and let the
						// batch continue. Other NotFoundErrors (delisted /
						// region-unavailable) stay retryable failures.
						if (
							error instanceof NotFoundError &&
							error.message === `Book ${book.asin} not found in region ${region}`
						) {
							raced += 1
							this.logger.info(`Ratings backfill: ${book.asin} deleted concurrently`)
							return
						}
						// Rows whose full-document write fails the collection
						// validator can still accept the fetched ratings block:
						// it is a pure field addition on a row that already
						// exists, and the conditional write below leaves a
						// concurrently-rated row untouched. History-enabled
						// repairs run through the generation fence
						// (persistRatingsRepair reasserts it atomically); the
						// history-disabled mode keeps the legacy papr write.
						if (isDocumentValidationError(error)) {
							const freshRatings =
								helper.freshData && 'ratings' in helper.freshData
									? helper.freshData.ratings
									: undefined
							if (freshRatings) {
								let modified: number
								// The underlying repair promise, captured so a
								// timeout can attach a settlement observer to
								// it (see the catch below). `withDeadline`
								// only stops AWAITING — the background repair
								// can commit AFTER the deadline, so the cache
								// invalidation must land after that commit,
								// not at the timeout.
								let repairPromise:
									| Promise<RatingsRepairResult>
									| Promise<{ modifiedCount: number }>
									| undefined
								try {
									if (isBookHistoryEnabled() && helper.persistedGeneration !== undefined) {
										// The handler's deadline has already
										// cleared: bound the repair with the
										// same per-item budget so a slow
										// transaction cannot commit in the
										// background past the scheduler item
										// timeout (in sequential mode the next
										// book would wait for it).
										const fencedRepairPromise = bookHistoryStore.persistRatingsRepair({
											asin: book.asin,
											region,
											generation: helper.persistedGeneration,
											bookId: book._id,
											ratings: freshRatings
										})
										repairPromise = fencedRepairPromise
										const repair: RatingsRepairResult = await withDeadline(
											fencedRepairPromise,
											getPerformanceConfig().SCHEDULER_ITEM_TIMEOUT_MS,
											`backfill ratings repair ${book.asin}`
										)
										if (repair.superseded) {
											// A newer generation owns the fence:
											// the books write was not attempted.
											// A race, not a failure.
											if (!prefetched.get(`${region}:${book.asin}`)) registerSuccess()
											raced += 1
											return
										}
										modified = repair.modified
									} else {
										// The legacy write is a plain model
										// call: bound it with the same budget
										// so a hung updateOne cannot park the
										// walk past the scheduler item timeout.
										const bookModel = BookModel as unknown as {
											updateOne: (
												filter: object,
												update: object,
												options?: object
											) => Promise<{ modifiedCount: number }>
										}
										const legacyRepairPromise = bookModel.updateOne(
											{ _id: book._id, ratings: { $exists: false } },
											{
												$set: { ratings: freshRatings },
												$unset: { ratingsBackfillSkip: '' },
												$currentDate: { updatedAt: true }
											},
											{ bypassDocumentValidation: true }
										)
										repairPromise = legacyRepairPromise
										const repair: { modifiedCount: number } = await withDeadline(
											legacyRepairPromise,
											getPerformanceConfig().SCHEDULER_ITEM_TIMEOUT_MS,
											`backfill ratings repair ${book.asin}`
										)
										modified = repair.modifiedCount
									}
								} catch (error) {
									if (error instanceof DeadlineExceededError) {
										// The deadline bounded the AWAIT, not
										// the write: a timed-out repair may
										// still commit in the background, so
										// the row may already carry ratings.
										// Invalidate the rating-less cache
										// entry a prior read left behind —
										// but AFTER the background repair
										// SETTLES (commits or aborts), not at
										// the timeout: a concurrent read in
										// the gap between a timeout-time
										// invalidation and the late commit
										// would repopulate the cache from the
										// still-rating-less row, and the later
										// commit carries no further
										// invalidation, so a stale entry
										// survives until TTL. Attach a
										// best-effort settlement observer to
										// the repair promise (the
										// `withDeadline` late-rejection
										// pattern) that runs the invalidation
										// once the write settles, then
										// rethrow so the row is retried on
										// the next pass (a committed row is no
										// longer in the target set).
										const cacheHelper = new RedisHelper(
											this.redis as unknown as FastifyRedis | null,
											'book',
											book.asin,
											region,
											this.logger
										)
										// A DeadlineExceededError can only come
										// from the awaited repair, so the
										// promise exists here (the optional
										// chain is a type-level guard for a
										// case that cannot occur).
										repairPromise
											?.catch(() => undefined)
											.finally(async () => {
												try {
													await cacheHelper.deleteOne()
												} catch {
													// Best-effort: the entry
													// expires on its TTL.
												}
											})
									}
									throw error
								}
								if (modified === 1) {
									// A prior read may have cached the rating-less
									// projection; the repair changed only MongoDB.
									const cacheHelper = new RedisHelper(
										this.redis as unknown as FastifyRedis | null,
										'book',
										book.asin,
										region,
										this.logger
									)
									try {
										await cacheHelper.deleteOne()
									} catch {
										// Best-effort: the entry expires on its TTL.
									}
									// The repair consumed a real upstream success. A
									// prefetched book already registered one success at
									// its batch request boundary; registering again here
									// would double-count the chunk.
									if (!prefetched.get(`${region}:${book.asin}`)) registerSuccess()
									this.logger.info(
										`Ratings backfill: repaired ${book.asin} after validation rejection`
									)
								} else {
									// A concurrent write rated or removed the row
									// between the fetch and this repair.
									raced += 1
								}
								return
							}
						}
						throw error
					} finally {
						// A prefetched product made no upstream request in this
						// iteration: the chunk boundary already paid the jitter
						// and cooldown for the one batch request that supplied
						// it. Sleeping per book here would turn a 50-book batch
						// into 50 × JITTER_MS and erase the batching win (the
						// live worker runs a fixed 10 s jitter). Only fallback
						// books — stubs or a failed chunk — pace per book.
						if (!prefetched.get(`${region}:${book.asin}`)) {
							// Serial pacing, same ladder as the scheduler walk:
							// the backfill used to run unjittered and drew 503s
							// within seconds, driving the shared adaptive
							// cooldown to its 7200 s ceiling and stalling every
							// pass on the worker. Jitter first, then the
							// cooldown — and in the finally so a rejected book
							// still paces the next one.
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
					// A `stale` disposition means a concurrent writer owns the
					// generation fence: the handler persisted nothing and the
					// direct repair below is correctly skipped. Tally the
					// outcome as a race (subtracted from `updated` at the end)
					// so the summary does not report an un-repaired row as
					// updated — the fetch itself was a usable upstream
					// success, so pacing/cooldown behavior is unchanged.
					// Checked BEFORE the ratings gate: a stale observation
					// whose superseded data carried no ratings must count as
					// the race it is, not as a missing-ratings failure.
					if (helper.historyDisposition === 'stale') {
						raced += 1
						if (!prefetched.get(`${region}:${book.asin}`)) registerSuccess()
						return
					}
					if (!ratings) {
						throw new Error(`Ratings were not populated for ${book.asin}`)
					}
					// An `accepted` observation with `modified: false` is the
					// equal-projection short-circuit: the store wrote nothing,
					// so no update happened. Tally it as a race (subtracted
					// from `updated` at the end) the same way a conditional
					// repair that matched no row is — the fetch itself was a
					// usable upstream success.
					if (helper.historyDisposition === 'accepted' && !helper.persisted) {
						if (!prefetched.get(`${region}:${book.asin}`)) registerSuccess()
						raced += 1
						return
					}
					// Write the ratings block directly when the handler could
					// not persist because of a genre-guard rejection: the guard
					// exists to stop genre-nuking updates, not to block a pure
					// field addition, and without this the row never leaves the
					// `ratings: {$exists: false}` target set. A `stale`
					// generation (returned earlier) or an
					// equal-projection short-circuit must NOT re-write the
					// field directly — that would bypass the generation fence.
					// In history-disabled mode the disposition is undefined and
					// the only remaining non-persisted outcome here is the
					// legacy papr genre guard (pre-orders returned earlier).
					if (
						!helper.persisted &&
						(helper.historyDisposition === undefined || helper.historyDisposition === 'rejected')
					) {
						let modified: number
						try {
							if (isBookHistoryEnabled() && helper.persistedGeneration !== undefined) {
								// History-enabled: revalidate the accepted-generation
								// fence ATOMICALLY with the write. The `rejected`
								// disposition only proves non-staleness while
								// persistObservation's own transaction ran; a newer
								// generation accepted in between would let an older
								// fetch's ratings land. The fence condition is part
								// of the conditional update, so a superseded
								// generation matches 0 and writes nothing. The
								// handler's deadline has already cleared, so bound
								// the repair with the same per-item budget (a slow
								// transaction must not commit in the background
								// past the scheduler item timeout).
								const repair = await withDeadline(
									bookHistoryStore.persistRatingsRepair({
										asin: book.asin,
										region,
										generation: helper.persistedGeneration,
										bookId: book._id,
										ratings
									}),
									getPerformanceConfig().SCHEDULER_ITEM_TIMEOUT_MS,
									`backfill ratings repair ${book.asin}`
								)
								if (repair.superseded) {
									// A newer generation accepted an equal
									// projection in between the `rejected`
									// disposition and the repair: the fence is
									// owned, the books write was not attempted.
									// This is a race (subtracted from `updated`
									// at the end) — not a batch failure, and it
									// must not reach the batchProcessor tally.
									// The fetch itself succeeded (a usable
									// product with ratings), so the shared
									// adaptive cooldown relaxes the same way as
									// every other raced-but-fetched outcome.
									if (!prefetched.get(`${region}:${book.asin}`)) registerSuccess()
									raced += 1
									return
								}
								modified = repair.modified
							} else {
								// History-disabled: the legacy papr genre guard is
								// the only non-persisted outcome here. papr's model
								// type omits updateOne; the runtime model has it
								// (UpdateScheduler.markChecked relies on the same).
								// The repair is a conditional field addition on
								// legacy stubs that already fail the validator for
								// unrelated missing content fields, so bypass
								// validation (content writes keep full validation)
								// — otherwise the row can never leave the target
								// set. The filter re-checks `ratings` so a row that
								// gained ratings concurrently is never touched.
								// The legacy write is a plain model call: bound
								// it with the same budget so a hung updateOne
								// cannot park the walk past the scheduler item
								// timeout.
								const bookModel = BookModel as unknown as {
									updateOne: (
										filter: object,
										update: object,
										options?: object
									) => Promise<{
										modifiedCount: number
									}>
								}
								const repair = await withDeadline(
									bookModel.updateOne(
										{ _id: book._id, ratings: { $exists: false } },
										{
											$set: { ratings },
											$unset: { ratingsBackfillSkip: '' },
											$currentDate: { updatedAt: true }
										},
										{ bypassDocumentValidation: true }
									),
									getPerformanceConfig().SCHEDULER_ITEM_TIMEOUT_MS,
									`backfill ratings repair ${book.asin}`
								)
								modified = repair.modifiedCount
							}
						} catch (error) {
							if (error instanceof DeadlineExceededError) {
								// The deadline bounded the AWAIT, not the
								// write: a timed-out repair may still commit
								// in the background, so the row may already
								// carry ratings. Invalidate the rating-less
								// cache entry a prior read left behind
								// (best-effort — the TTL covers a miss), then
								// rethrow so the row is retried on the next
								// pass (a committed row is no longer in the
								// target set).
								const cacheHelper = new RedisHelper(
									this.redis as unknown as FastifyRedis | null,
									'book',
									book.asin,
									region,
									this.logger
								)
								try {
									await cacheHelper.deleteOne()
								} catch {
									// Best-effort: the entry expires on its TTL.
								}
							}
							throw error
						}
						if (modified !== 1) {
							// Matched 0: a concurrent write already handled the
							// row (rated it in the meantime, or a newer
							// generation superseded the fence) — nothing left
							// to do, and it must not count as our update.
							raced += 1
						} else {
							// The handler's rejection path cached the stored
							// rating-less projection (the legacy path caches
							// its stored projection too); the repair changed
							// only MongoDB, so reads would serve the pre-repair
							// projection for the whole TTL. Invalidate the key.
							const cacheHelper = new RedisHelper(
								this.redis as unknown as FastifyRedis | null,
								'book',
								book.asin,
								region,
								this.logger
							)
							try {
								await cacheHelper.deleteOne()
							} catch {
								// Best-effort: a cache outage here must not fail
								// the book — the entry expires on its TTL.
							}
						}
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
