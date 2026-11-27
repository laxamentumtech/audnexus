import { afterAll, afterEach, beforeEach, describe, expect, mock, test, vi } from 'bun:test'

const mockBookFind = mock()
const mockBookUpdateOne = mock()
const mockMarkUpdateOne = mock()
const mockProcessBatchByRegion = mock()
const mockShowHandler = mock()
const showConstructorArgs: unknown[][] = []

mock.module('#config/models/Book', () => ({
	default: class BookModel {
		static find = mockBookFind
		static updateOne = mockBookUpdateOne
		static collection = { updateOne: mockMarkUpdateOne }
	}
}))

mock.module('#helpers/utils/batchProcessor', () => ({
	processBatchByRegion: mockProcessBatchByRegion
}))

const mockFetch = mock()

let historyEnabled = false
const mockReserveGeneration = mock()
const mockPersistRatingsRepair = mock()
const mockMarkNonBook = mock()

mock.module('#config/bookHistory', () => ({
	isBookHistoryEnabled: () => historyEnabled
}))

mock.module('#config/papr', () => ({
	bookHistoryStore: {
		reserveGeneration: mockReserveGeneration,
		persistRatingsRepair: mockPersistRatingsRepair,
		markNonBook: mockMarkNonBook
	}
}))

mock.module('#helpers/utils/fetchPlus', () => ({
	default: mockFetch
}))

// Whether the stubbed show helper reports its full-document write as
// persisted; the backfill falls back to a direct ratings write when false.
let mockPersisted = false
// The history store disposition as the real helper exposes it: only a
// genre-guard rejection (or history-disabled mode, undefined) may trigger
// the direct ratings write.
let mockHistoryDisposition: unknown
// Fresh upstream data as the real helper exposes it; used when the handler
// resolves with the stored row (equal-projection short-circuit) instead.
let mockFreshData: unknown
// The generation the (real) helper reserved the fetch under; the
// history-enabled repair revalidates the fence against it.
let mockPersistedGeneration: number | undefined
// The generation the (real) helper reserved the fetch under (exposed even
// when the fetch failed before persistence ran); the history-enabled
// terminal mark fences on it when persistedGeneration is absent.
let mockReservedGeneration: number | undefined

mock.module('#helpers/routes/BookShowHelper', () => ({
	default: class MockBookShowHelper {
		constructor(...args: unknown[]) {
			showConstructorArgs.push(args)
		}
		handler = mockShowHandler
		persisted = mockPersisted
		historyDisposition = mockHistoryDisposition
		freshData = mockFreshData
		persistedGeneration = mockPersistedGeneration
		reservedGeneration = mockReservedGeneration
	}
}))

// The repair invalidates the per-book cache key through the REAL
// RedisHelper: only the redis client's `del` is mocked, so deleteOne's
// log/throw path is production code under test. The real class is captured
// BEFORE the module mock is registered (the mock factory then extends it).
const mockRedisDel = mock()
const cacheDeleteOneCalls: unknown[] = []
// Dynamic import on purpose: it must load the REAL module before the
// mock.module registration below (a static import here would be hoisted
// after registration and return the mock).
const realRedisModule = await import('#helpers/database/redis/RedisHelper')

mock.module('#helpers/database/redis/RedisHelper', () => ({
	default: class extends realRedisModule.default {
		constructor(...args: unknown[]) {
			super(...(args as ConstructorParameters<typeof realRedisModule.default>))
			cacheDeleteOneCalls.push(args)
		}
	}
}))
// The client whose `del` the real deleteOne calls (instance is
// `client?.del(key)` — a method on the injected redis client, not the
// RedisHelper).
const cacheClient = { del: mockRedisDel }

// Cooldown is process-global and sleeps real time; stub it so the pacing
// test asserts calls without waiting.
const mockSleepCooldown = mock()
const mockRegisterSuccess = mock()

mock.module('#helpers/utils/adaptiveCooldown', () => ({
	sleepCooldown: mockSleepCooldown,
	registerSuccess: mockRegisterSuccess
}))

// Serial pacing sleeps real time; stub it so the pacing assertions do not wait.
const mockJitteredSleep = mock()

mock.module('#helpers/utils/jitteredSleep', () => ({
	jitteredSleep: mockJitteredSleep
}))

import { ObjectId } from 'mongodb'

import { resetPerformanceConfig, setPerformanceConfig } from '#config/performance'
import { ContentTypeMismatchError, NotFoundError } from '#helpers/errors/ApiErrors'
import BookBackfillHelper from '#helpers/routes/BookBackfillHelper'
import { apiResponse } from '#tests/datasets/helpers/books'
import { createMockLogger } from '#tests/setup/mockLogger'
import { createTestPerformanceConfig } from '#tests/setup/performanceConfig'

const deepCopyProduct = JSON.parse(JSON.stringify(apiResponse.product)) as Record<string, unknown>

const books = [
	{ _id: new ObjectId('5c8f8f8f8f8f8f8f8f8f8f01'), asin: 'B000000001', region: 'us' },
	{ _id: new ObjectId('5c8f8f8f8f8f8f8f8f8f8f02'), asin: 'B000000002', region: 'uk' },
	{ _id: new ObjectId('5c8f8f8f8f8f8f8f8f8f8f03'), asin: 'B000000003', region: null }
]

const bookWithRatings = {
	asin: 'B000000001',
	rating: '4.6',
	releaseDate: new Date('2024-01-01T00:00:00Z'),
	ratings: { value: '4.6', numRatings: 120, numReviews: 8 }
}

const bookPreOrder = {
	asin: 'B000000003',
	rating: '4.0',
	releaseDate: new Date('2999-01-01T00:00:00Z'),
	ratings: { value: '4.0', numRatings: 5, numReviews: 1 }
}

const bookWithoutRatings = {
	asin: 'B000000002',
	rating: '4.2'
}

describe('BookBackfillHelper should', () => {
	let helper: BookBackfillHelper
	let savedBatchSize: string | undefined

	beforeEach(() => {
		// The per-book default path is the baseline: a process environment
		// that inherits AUDIBLE_BATCH_SIZE would silently put every test on
		// the batch path, breaking the per-book pacing assertions. Save the
		// inherited value (preserving undefined) and pin the baseline to 1
		// (which keeps the proven per-book path); batch tests override it.
		savedBatchSize = process.env.AUDIBLE_BATCH_SIZE
		process.env.AUDIBLE_BATCH_SIZE = '1'
		mock.clearAllMocks()
		historyEnabled = false
		mockSleepCooldown.mockResolvedValue(undefined)
		mockJitteredSleep.mockResolvedValue(undefined)
		mockBookUpdateOne.mockResolvedValue({ modifiedCount: 1 })
		mockMarkUpdateOne.mockResolvedValue({ modifiedCount: 1 })
		mockPersisted = false
		mockHistoryDisposition = undefined
		mockFreshData = undefined
		mockPersistedGeneration = undefined
		mockReservedGeneration = undefined
		mockPersistRatingsRepair.mockReset()
		mockPersistRatingsRepair.mockResolvedValue({ modified: 1, superseded: false })
		mockMarkNonBook.mockReset()
		mockMarkNonBook.mockResolvedValue({ modified: 1, superseded: false })
		mockRedisDel.mockReset()
		mockRedisDel.mockResolvedValue(1)
		cacheDeleteOneCalls.length = 0
		showConstructorArgs.length = 0
		helper = new BookBackfillHelper(createMockLogger(), cacheClient)
		// First call returns the batch, second returns empty to end pagation
		mockBookFind.mockResolvedValueOnce(books).mockResolvedValueOnce([])
		mockShowHandler.mockResolvedValue(bookWithRatings)
		mockProcessBatchByRegion.mockImplementation(
			async (
				items: { asin: string }[],
				processor: (item: { asin: string }) => Promise<unknown>
			) => {
				let success = 0
				let failures = 0
				for (const item of items) {
					try {
						await processor(item)
						success += 1
					} catch {
						failures += 1
					}
				}
				return {
					results: [],
					summary: {
						total: items.length,
						success,
						failures,
						regions: {},
						maxConcurrencyObserved: 1
					}
				}
			}
		)
	})

	afterEach(() => {
		// Restore the inherited value (or its absence) so the suite does not
		// leak the baseline into the process environment for later files.
		if (savedBatchSize === undefined) delete process.env.AUDIBLE_BATCH_SIZE
		else process.env.AUDIBLE_BATCH_SIZE = savedBatchSize
	})

	test('queries only books missing the ratings field in _id-ordered batches', async () => {
		await helper.process()
		expect(mockBookFind).toHaveBeenCalledTimes(2)
		expect(mockBookFind).toHaveBeenNthCalledWith(
			1,
			{
				$and: [
					{
						ratings: { $exists: false },
						ratingsBackfillSkip: { $exists: false },
						rating: { $exists: true, $nin: ['0.0', '0'] }
					}
				]
			},
			{ projection: { asin: 1, region: 1 }, sort: { _id: 1 }, limit: 1000 }
		)
		expect(mockBookFind).toHaveBeenNthCalledWith(
			2,
		{
			$and: [
				{
					ratings: { $exists: false },
					ratingsBackfillSkip: { $exists: false },
					rating: { $exists: true, $nin: ['0.0', '0'] }
				},
				{ _id: { $gt: books[books.length - 1]._id } }
			]
		},
		{ projection: { asin: 1, region: 1 }, sort: { _id: 1 }, limit: 1000 }
		)
	})

	test('forces a refetch for every book and falls back to the us region', async () => {
		await helper.process()
		expect(showConstructorArgs).toHaveLength(3)
		for (const args of showConstructorArgs) {
			// The shared setup injects the cache client (see
			// `new BookBackfillHelper(createMockLogger(), cacheClient)`), so
			// every show helper carries it — the repair's cache invalidation
			// depends on this injection.
			expect(args[2]).toBe(cacheClient)
			expect(args[3]).toEqual(
				expect.objectContaining({ forceUpdate: true })
			)
			// Ratings come from the API; the backfill skips the HTML scrape.
			expect(args[3]).toEqual(
				expect.objectContaining({ skipHtml: true })
			)
		}
		expect(showConstructorArgs[0][1]).toEqual({ region: 'us', update: '1' })
		expect(showConstructorArgs[1][1]).toEqual({ region: 'uk', update: '1' })
		expect(showConstructorArgs[2][1]).toEqual({ region: 'us', update: '1' })
	})

	test('maps the batch summary to the backfill result', async () => {
		await expect(helper.process()).resolves.toEqual({ total: 3, updated: 3, skipped: 0, terminalSkipped: 0, failed: 0 })
	})

	test('accumulates failures across multiple pages', async () => {
		const secondPage = [
			{ _id: new ObjectId('5c8f8f8f8f8f8f8f8f8f8f04'), asin: 'B000000004', region: 'us' }
		]
		mockBookFind.mockReset()
		mockBookFind
			.mockResolvedValueOnce(books)
			.mockResolvedValueOnce(secondPage)
			.mockResolvedValueOnce([])
		// First page: B2 without ratings (failed), B1/B3 pre-orders (skipped);
		// second page: B4 pre-order (skipped). Skipped counts as batch success.
		mockShowHandler.mockImplementation(async () => {
			const asin = showConstructorArgs.at(-1)?.[0]
			return asin === 'B000000002' ? bookWithoutRatings : bookPreOrder
		})
		await expect(helper.process()).resolves.toEqual({ total: 4, updated: 0, skipped: 3, terminalSkipped: 0, failed: 1 })
	})

	test('accumulates totals across multiple pages', async () => {
		const secondPage = [
			{ _id: new ObjectId('5c8f8f8f8f8f8f8f8f8f8f04'), asin: 'B000000004', region: 'us' },
			{ _id: new ObjectId('5c8f8f8f8f8f8f8f8f8f8f05'), asin: 'B000000005', region: 'us' }
		]
		mockBookFind.mockReset()
		mockBookFind
			.mockResolvedValueOnce(books)
			.mockResolvedValueOnce(secondPage)
			.mockResolvedValueOnce([])
		await expect(helper.process()).resolves.toEqual({ total: 5, updated: 5, skipped: 0, terminalSkipped: 0, failed: 0 })
		expect(mockBookFind).toHaveBeenNthCalledWith(
			2,
			{
				$and: [
					{
						ratings: { $exists: false },
						ratingsBackfillSkip: { $exists: false },
						rating: { $exists: true, $nin: ['0.0', '0'] }
					},
					{ _id: { $gt: books[books.length - 1]._id } }
				]
			},
			{ projection: { asin: 1, region: 1 }, sort: { _id: 1 }, limit: 1000 }
		)
		expect(mockBookFind).toHaveBeenNthCalledWith(
			3,
			{
				$and: [
					{
						ratings: { $exists: false },
						ratingsBackfillSkip: { $exists: false },
						rating: { $exists: true, $nin: ['0.0', '0'] }
					},
					{ _id: { $gt: secondPage[secondPage.length - 1]._id } }
				]
			},
			{ projection: { asin: 1, region: 1 }, sort: { _id: 1 }, limit: 1000 }
		)
	})

	test('counts a book as failed when the refetch does not populate ratings', async () => {
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[1]]).mockResolvedValueOnce([])
		mockShowHandler.mockImplementation(async () => bookWithoutRatings)
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 0, skipped: 0, terminalSkipped: 0, failed: 1 })
	})

	test('counts a book as failed when the handler returns undefined', async () => {
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce(books).mockResolvedValueOnce([])
		mockShowHandler.mockImplementation(async () => undefined)
		await expect(helper.process()).resolves.toEqual({ total: 3, updated: 0, skipped: 0, terminalSkipped: 0, failed: 3 })
	})

	test('counts a pre-order book as skipped, not updated', async () => {
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[2]]).mockResolvedValueOnce([])
		mockShowHandler.mockImplementation(async () => bookPreOrder)
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 0, skipped: 1, terminalSkipped: 0, failed: 0 })
	})

	test('sleeps the adaptive cooldown even when the handler rejects', async () => {
		// The rejection path (e.g. an upstream 503) must still pace the next
		// book — the cooldown sleep runs in a finally around the handler.
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockShowHandler.mockImplementation(async () => {
			throw new Error('upstream 503')
		})
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 0, skipped: 0, terminalSkipped: 0, failed: 1 })
		expect(mockJitteredSleep).toHaveBeenCalledTimes(1)
		expect(mockSleepCooldown).toHaveBeenCalledTimes(1)
		expect(mockRegisterSuccess).not.toHaveBeenCalled()
	})

	test('paces every book with scheduler jitter, including failures', async () => {
		// The unjittered backfill drew 503s within seconds and drove the shared
		// adaptive cooldown to 7200 s, so each item must take the walk's jitter
		// delay — and a rejected item must not skip the next one's pacing.
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce(books).mockResolvedValueOnce([])
		mockShowHandler.mockImplementation(async () => {
			const asin = showConstructorArgs.at(-1)?.[0]
			if (asin === 'B000000002') throw new Error('upstream 503')
			return bookWithRatings
		})
		await expect(helper.process()).resolves.toEqual({ total: 3, updated: 2, skipped: 0, terminalSkipped: 0, failed: 1 })
		expect(mockJitteredSleep).toHaveBeenCalledTimes(3)
		expect(mockSleepCooldown).toHaveBeenCalledTimes(3)
	})

	test('sleeps the adaptive cooldown and registers success for a good book', async () => {
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 1, skipped: 0, terminalSkipped: 0, failed: 0 })
		expect(mockSleepCooldown).toHaveBeenCalledTimes(1)
		expect(mockRegisterSuccess).toHaveBeenCalledTimes(1)
	})

	test('writes ratings directly when the full update was not persisted', async () => {
		// Old catalog rows have no category ladders upstream: a genre-less
		// observation that matches the stored row takes the
		// equal-projection short-circuit (stored genres preserved by the
		// genre-preserving merge, no write). The ratings block from the
		// fresh fetch is a pure addition and must still land, or the row
		// never leaves the backfill's target set.
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockPersisted = false
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 1, skipped: 0, terminalSkipped: 0, failed: 0 })
		// The repair is conditional: it only touches a row that STILL lacks
		// ratings, so a row rated by a concurrent write is never overwritten.
		expect(mockBookUpdateOne).toHaveBeenCalledWith(
			{ _id: books[0]._id, ratings: { $exists: false } },
			{
				$set: { ratings: bookWithRatings.ratings },
				$unset: { ratingsBackfillSkip: '' },
				$currentDate: { updatedAt: true }
			},
			{ bypassDocumentValidation: true }
		)
	})

	test('counts a raced ratings repair as neither updated nor failed', async () => {
		// A concurrent update=1 refresh populated ratings after the backfill
		// read: the conditional filter matches nothing, the row is not
		// clobbered, and the pass counts the race, not a ratings update.
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockBookUpdateOne.mockResolvedValue({ modifiedCount: 0 })
		mockPersisted = false
		await expect(helper.process()).resolves.toEqual({
			total: 1,
			updated: 0,
			skipped: 0,
			terminalSkipped: 0,
			failed: 0
		})
		expect(mockBookUpdateOne).toHaveBeenCalledWith(
			{ _id: books[0]._id, ratings: { $exists: false } },
			{
				$set: { ratings: bookWithRatings.ratings },
				$unset: { ratingsBackfillSkip: '' },
				$currentDate: { updatedAt: true }
			},
			{ bypassDocumentValidation: true }
		)
		expect(mockRegisterSuccess).toHaveBeenCalledTimes(1)
	})

	test('uses the fresh ratings when the handler resolved with the stored row', async () => {
		// An equal-projection short-circuit (stored genres preserved by the
		// genre-preserving merge) returns the old stored record without
		// ratings; the fresh fetch's ratings block must still be written.
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockShowHandler.mockImplementation(async () => bookWithoutRatings)
		mockFreshData = bookWithRatings
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 1, skipped: 0, terminalSkipped: 0, failed: 0 })
		expect(mockBookUpdateOne).toHaveBeenCalledWith(
			{ _id: books[0]._id, ratings: { $exists: false } },
			{
				$set: { ratings: bookWithRatings.ratings },
				$unset: { ratingsBackfillSkip: '' },
				$currentDate: { updatedAt: true }
			},
			{ bypassDocumentValidation: true }
		)
	})

	test('does not repair when the store disposition is stale (generation fence)', async () => {
		// A `stale` disposition means a concurrent writer owns the generation
		// fence: the direct field write would bypass that fence, so the
		// repair must not run even when the handler persisted nothing — and
		// the un-repaired book counts as a race, not an update (the summary
		// must not report a skipped repair as an updated row).
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockPersisted = false
		mockHistoryDisposition = 'stale'
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 0, skipped: 0, terminalSkipped: 0, failed: 0 })
		expect(mockBookUpdateOne).not.toHaveBeenCalled()
		expect(mockPersistRatingsRepair).not.toHaveBeenCalled()
	})

	test('does not repair on the equal short-circuit (accepted, unmodified)', async () => {
		// An accepted-but-unmodified observation is an equal projection, not a
		// genre-guard rejection: nothing was refused, so no repair write — and
		// the short-circuit itself tallies as a race (the row's stored
		// projection matched, so no update happened this pass).
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockPersisted = false
		mockHistoryDisposition = 'accepted'
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 0, skipped: 0, terminalSkipped: 0, failed: 0 })
		expect(mockBookUpdateOne).not.toHaveBeenCalled()
	})

	test('does not rewrite ratings when the full update persisted them', async () => {
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockPersisted = true
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 1, skipped: 0, terminalSkipped: 0, failed: 0 })
		expect(mockBookUpdateOne).not.toHaveBeenCalled()
	})

	test('marks a non-book content type and counts it terminal', async () => {
		// Comics/bundles/podcasts can never produce book ratings; marking them
		// is what lets the keyset stop re-walking them.
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockShowHandler.mockImplementation(async () => {
			throw new ContentTypeMismatchError('Item is a SinglePartIssue, not a book.', {
				asin: books[0].asin,
				requestedType: 'book',
				actualType: 'SinglePartIssue'
			})
		})
		// Fake timers pin `new Date()` so the marker payload can be asserted
		// exactly, including markedAt.
		vi.useFakeTimers({ now: new Date('2026-11-14T12:00:00.000Z') })
		try {
			await expect(helper.process()).resolves.toEqual({
				total: 1,
				updated: 0,
				skipped: 0,
				terminalSkipped: 1,
				failed: 0
			})
			expect(mockMarkUpdateOne).toHaveBeenCalledWith(
				{
					_id: books[0]._id,
					ratings: { $exists: false },
					ratingsBackfillSkip: { $exists: false }
				},
				[
					{
						$set: {
							createdAt: { $ifNull: ['$createdAt', { $toDate: '$_id' }] },
							ratingsBackfillSkip: {
								reason: 'non_book',
								contentType: 'SinglePartIssue',
								markedAt: new Date('2026-11-14T12:00:00.000Z')
							}
						}
					}
				],
				{ bypassDocumentValidation: true }
			)
		} finally {
			vi.useRealTimers()
		}
	})

	test('leaves a details-less content-type rejection unmarked and retryable', async () => {
		// A ContentTypeMismatchError without details carries no content type;
		// the row must stay in the target set for the next pass, not be
		// guessed terminal.
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockShowHandler.mockImplementation(async () => {
			throw new ContentTypeMismatchError('Item content type is unrecognized.')
		})
		await expect(helper.process()).resolves.toEqual({
			total: 1,
			updated: 0,
			skipped: 0,
			terminalSkipped: 0,
			failed: 1
		})
		expect(mockMarkUpdateOne).not.toHaveBeenCalled()
	})

	test('leaves retryable failures unmarked', async () => {
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockShowHandler.mockImplementation(async () => {
			throw new NotFoundError('Product not available in region')
		})
		await expect(helper.process()).resolves.toEqual({
			total: 1,
			updated: 0,
			skipped: 0,
			terminalSkipped: 0,
			failed: 1
		})
		expect(mockMarkUpdateOne).not.toHaveBeenCalled()
	})

	test('counts a raced marker write as neither updated nor failed', async () => {
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockMarkUpdateOne.mockResolvedValue({ modifiedCount: 0 })
		mockShowHandler.mockImplementation(async () => {
			throw new ContentTypeMismatchError('Item is a Bundle, not a book.', {
				asin: books[0].asin,
				requestedType: 'book',
				actualType: 'Bundle'
			})
		})
		await expect(helper.process()).resolves.toEqual({
			total: 1,
			updated: 0,
			skipped: 0,
			terminalSkipped: 0,
			failed: 0
		})
		expect(mockMarkUpdateOne).toHaveBeenCalledTimes(1)
	})

	test('counts a failed marker write as a failure', async () => {
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockMarkUpdateOne.mockRejectedValue(new Error('Document failed validation'))
		mockShowHandler.mockImplementation(async () => {
			throw new ContentTypeMismatchError('Item is a SinglePartIssue, not a book.', {
				asin: books[0].asin,
				requestedType: 'book',
				actualType: 'SinglePartIssue'
			})
		})
		await expect(helper.process()).resolves.toEqual({
			total: 1,
			updated: 0,
			skipped: 0,
			terminalSkipped: 0,
			failed: 1
		})
	})

	test('fences the history-enabled terminal mark: a successful fenced mark counts terminal', async () => {
		// History-enabled: a typed content-type rejection with a reserved
		// generation but NO persistedGeneration (the fetch failed before
		// persistence ran) fences the marker write on the RESERVED
		// generation through bookHistoryStore.markNonBook (the fence
		// predicate is part of the same transaction as the marker write).
		// A successful fenced mark (modified: 1) counts terminalSkipped, and
		// the unfenced write (markNonBook's direct collection.updateOne) must
		// NOT be used.
		historyEnabled = true
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockShowHandler.mockImplementation(async () => {
			throw new ContentTypeMismatchError('Item is a SinglePartIssue, not a book.', {
				asin: books[0].asin,
				requestedType: 'book',
				actualType: 'SinglePartIssue'
			})
		})
		// The (real) helper exposes the reserved generation; no persisted
		// generation (the fetch failed before persistence ran).
		mockReservedGeneration = 9
		try {
			await expect(helper.process()).resolves.toEqual({
				total: 1,
				updated: 0,
				skipped: 0,
				terminalSkipped: 1,
				failed: 0
			})
		} finally {
			historyEnabled = false
		}
		expect(mockMarkNonBook).toHaveBeenCalledTimes(1)
		expect(mockMarkNonBook).toHaveBeenCalledWith({
			asin: books[0].asin,
			region: 'us',
			generation: 9,
			bookId: books[0]._id,
			contentType: 'SinglePartIssue'
		})
		// The unfenced write is NOT used on the history-enabled path.
		expect(mockMarkUpdateOne).not.toHaveBeenCalled()
	})

	test('fences the history-enabled terminal mark: a superseded mark counts neither updated nor failed', async () => {
		// A newer generation owns the fence (markNonBook reports
		// superseded): the marker write is not attempted, the book tallies
		// as a race (neither updated nor failed), and the unfenced write is
		// NOT used.
		historyEnabled = true
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockShowHandler.mockImplementation(async () => {
			throw new ContentTypeMismatchError('Item is a Bundle, not a book.', {
				asin: books[0].asin,
				requestedType: 'book',
				actualType: 'Bundle'
			})
		})
		mockReservedGeneration = 9
		mockMarkNonBook.mockResolvedValue({ modified: 0, superseded: true })
		try {
			await expect(helper.process()).resolves.toEqual({
				total: 1,
				updated: 0,
				skipped: 0,
				terminalSkipped: 0,
				failed: 0
			})
		} finally {
			historyEnabled = false
		}
		expect(mockMarkNonBook).toHaveBeenCalledTimes(1)
		expect(mockMarkUpdateOne).not.toHaveBeenCalled()
	})

	test('passes the injected cache client to BookShowHelper', async () => {
		const cacheClient = { get: mock(), set: mock(), del: mock(), ping: mock() }
		const withRedis = new BookBackfillHelper(createMockLogger(), cacheClient)
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		await withRedis.process()
		expect(showConstructorArgs[0][2]).toBe(cacheClient)
	})

	test('counts a ratingless pre-order as skipped, not failed', async () => {
		// The pre-order check runs before the ratings gate: a future
		// releaseDate with no upstream rating data is reported skipped (it is
		// not persisted, so it stays a backfill target), not counted failed.
		const ratinglessPreOrder = {
			asin: 'B000000003',
			releaseDate: new Date('2999-01-01T00:00:00Z')
		}
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[2]]).mockResolvedValueOnce([])
		mockShowHandler.mockImplementation(async () => ratinglessPreOrder)
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 0, skipped: 1, terminalSkipped: 0, failed: 0 })
	})

	test('counts a non-pre-order ratingless result as failed', async () => {
		// No future releaseDate → the pre-order branch does not apply; the
		// ratings gate throws and the book counts failed.
		const ratinglessStale = { asin: 'B000000001', releaseDate: new Date('2024-01-01T00:00:00Z') }
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockShowHandler.mockImplementation(async () => ratinglessStale)
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 0, skipped: 0, terminalSkipped: 0, failed: 1 })
	})

	test('falls back to the per-book path when the batch request fails', async () => {
		process.env.AUDIBLE_BATCH_SIZE = '50'
		mockFetch.mockRejectedValue(new Error('503'))
		try {
			await helper.process()
		} finally {
			delete process.env.AUDIBLE_BATCH_SIZE
		}

		expect(mockFetch).toHaveBeenCalled()
		// Every book reaches the per-book fallback with NO prefetched product
		// (an empty loop would pass this check vacuously).
		expect(showConstructorArgs).toHaveLength(3)
		for (const args of showConstructorArgs) {
			const options = args[3] as { prefetched?: unknown }
			expect(options.prefetched).toBeUndefined()
		}
		// The failed chunk registers no batch success; each processed book
		// registers its own.
		expect(mockRegisterSuccess).toHaveBeenCalledTimes(3)
	})

	test('carries a pre-reserved generation with the prefetched product', async () => {
		process.env.AUDIBLE_BATCH_SIZE = '50'
		historyEnabled = true
		mockReserveGeneration.mockResolvedValue(7)
		mockFetch.mockResolvedValue({
			data: {
				products: [{ ...deepCopyProduct, asin: 'B000000001' }],
				response_groups: ['rating'],
				total_results: 1
			}
		})
		try {
			await helper.process()
		} finally {
			delete process.env.AUDIBLE_BATCH_SIZE
			historyEnabled = false
		}

		const firstCall = showConstructorArgs.find((args) => args[0] === 'B000000001')
		const firstOptions = firstCall?.[3] as {
			prefetched?: unknown
			reservedGeneration?: number
		}
		expect(firstOptions.prefetched).toBeDefined()
		expect(firstOptions.reservedGeneration).toBe(7)
	})

	test('does not forward the batch generation to per-book fallback fetches', async () => {
		// Regression: the batch reserves a generation per ASIN BEFORE the
		// request, but a stub ASIN (no product returned) falls back to the
		// per-book fetch. Forwarding the pre-reserved generation would
		// fence the fallback under a generation reserved before ITS fetch;
		// a concurrent refresh that accepted a newer generation in between
		// would mark the fallback write stale and drop its ratings. Only a
		// CONSUMED prefetched product may carry the batch generation.
		process.env.AUDIBLE_BATCH_SIZE = '50'
		historyEnabled = true
		mockReserveGeneration.mockResolvedValue(7)
		mockFetch.mockImplementation(async () => ({
			data: {
				products: [{ ...deepCopyProduct, asin: 'B000000001' }],
				response_groups: ['rating'],
				total_results: 1
			}
		}))
		try {
			await helper.process()
		} finally {
			delete process.env.AUDIBLE_BATCH_SIZE
			historyEnabled = false
		}
		// All three ASINs were reserved before their chunks (us chunk:
		// B000000001+B000000003, uk chunk: B000000002), and exactly one
		// product was found.
		expect(mockReserveGeneration).toHaveBeenCalledTimes(3)
		const optionFor = (asin: string) => {
			const args = showConstructorArgs.find((a) => a[0] === asin)
			return args?.[3] as { prefetched?: unknown; reservedGeneration?: number }
		}
		// B000000001: prefetched product CONSUMED → the batch generation
		// is carried.
		expect(optionFor('B000000001').prefetched).toBeDefined()
		expect(optionFor('B000000001').reservedGeneration).toBe(7)
		// B000000003 (us) and B000000002 (uk): stubs / no product found →
		// the per-book fallback must reserve its own generation, so the
		// batch generation must NOT be forwarded.
		expect(optionFor('B000000003').prefetched).toBeUndefined()
		expect(optionFor('B000000003').reservedGeneration).toBeUndefined()
		expect(optionFor('B000000002').prefetched).toBeUndefined()
		expect(optionFor('B000000002').reservedGeneration).toBeUndefined()
	})

	test('authorizes the batch only from the pre-fetch reservation snapshot, not the live map', async () => {
		// The pre-fetch snapshot (not the live map) decides which prefetched
		// products may reuse the batch's pre-reserved generation: a
		// reservation that completes AFTER the deadline (and so after the
		// batch request has started) must not authorize an already-started
		// batch, and the timed-out reservation loop must start no further
		// reservations. Three us-region books in one 50-ASIN chunk:
		//   book 1's reservation resolves before the deadline (in the
		//   snapshot → batch path), book 2's is deferred past the deadline
		//   (lands in the LIVE map only → single-book path), book 3 is never
		//   reserved (the loop stopped at the deadline → single-book path).
		process.env.AUDIBLE_BATCH_SIZE = '50'
		historyEnabled = true
		setPerformanceConfig(createTestPerformanceConfig({ SCHEDULER_ITEM_TIMEOUT_MS: 50 }))
		vi.useFakeTimers()
		// ASINs must pass AsinSchema (B-prefixed 10-char): fetchProductsByAsin
		// silently drops malformed IDs, which would skip the batch fetch
		// entirely and hang the fetchStarted barrier below.
		const usBooks = [
			{ _id: new ObjectId('5c8f8f8f8f8f8f8f8f8f8f10'), asin: 'B0US000001', region: 'us' },
			{ _id: new ObjectId('5c8f8f8f8f8f8f8f8f8f8f11'), asin: 'B0US000002', region: 'us' },
			{ _id: new ObjectId('5c8f8f8f8f8f8f8f8f8f8f12'), asin: 'B0US000003', region: 'us' }
		]
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce(usBooks).mockResolvedValueOnce([])
		// book 1 resolves before the deadline; book 2 is deferred (we hold
		// its resolution until AFTER the snapshot); book 3 must never be
		// requested (the loop stops at the deadline).
		const deferred = Promise.withResolvers<number>()
		const { promise: book2Requested, resolve: releaseBook2 } = Promise.withResolvers<void>()
		mockReserveGeneration.mockImplementation((asin: string) => {
			if (asin === 'B0US000001') return Promise.resolve(100)
			if (asin === 'B0US000002') {
				releaseBook2()
				return deferred.promise
			}
			return Promise.resolve(300)
		})
		const { promise: fetchStarted, resolve: releaseFetch } = Promise.withResolvers<void>()
		mockFetch.mockImplementation(() => {
			releaseFetch()
			return Promise.resolve({
				data: {
					products: [
						{ ...deepCopyProduct, asin: 'B0US000001' },
						{ ...deepCopyProduct, asin: 'B0US000002' },
						{ ...deepCopyProduct, asin: 'B0US000003' }
					],
					response_groups: ['rating'],
					total_results: 3
				}
			})
		})
		try {
			const pending = helper.process()
			// The reservation loop has requested book 2 (deferred) and the
			// deadline timer is armed; the loop is now stuck awaiting book 2.
			await book2Requested
			// Fire the reservation deadline: the snapshot is taken with ONLY
			// book 1, then the batch fetch starts.
			vi.advanceTimersByTime(60)
			await fetchStarted
			// book 2's reservation completes AFTER the snapshot: it lands in
			// the live map but not in reservedBeforeFetch, so it must NOT
			// authorize the batch's result.
			deferred.resolve(200)
			await expect(pending).resolves.toEqual({
				total: 3,
				updated: 3,
				skipped: 0,
				terminalSkipped: 0,
				failed: 0
			})
		} finally {
			vi.useRealTimers()
			resetPerformanceConfig()
			delete process.env.AUDIBLE_BATCH_SIZE
			historyEnabled = false
		}
		// The timed-out loop started no further reservation: book 1 and book
		// 2 were requested, but book 3 (after the deadline) was not.
		expect(mockReserveGeneration).toHaveBeenCalledTimes(2)
		const optionFor = (asin: string) => {
			const args = showConstructorArgs.find((a) => a[0] === asin)
			return args?.[3] as { prefetched?: unknown; reservedGeneration?: number }
		}
		// book 1: in the pre-fetch snapshot → the batch product is consumed
		// and the batch generation is carried.
		expect(optionFor('B0US000001').prefetched).toBeDefined()
		expect(optionFor('B0US000001').reservedGeneration).toBe(100)
		// book 2: reserved late (live map only) → the batch product is NOT
		// consumed; the per-book fallback reserves its own generation, so the
		// batch generation must NOT be forwarded.
		expect(optionFor('B0US000002').prefetched).toBeUndefined()
		expect(optionFor('B0US000002').reservedGeneration).toBeUndefined()
		// book 3: never reserved (loop stopped at the deadline) → per-book
		// fallback, no batch generation.
		expect(optionFor('B0US000003').prefetched).toBeUndefined()
		expect(optionFor('B0US000003').reservedGeneration).toBeUndefined()
	})

	test('drops a prefetched product whose generation could not be reserved', async () => {
		process.env.AUDIBLE_BATCH_SIZE = '50'
		historyEnabled = true
		mockReserveGeneration.mockRejectedValue(new Error('identity conflict'))
		mockFetch.mockResolvedValue({
			data: {
				products: [{ ...deepCopyProduct, asin: 'B000000001' }],
				response_groups: ['rating'],
				total_results: 1
			}
		})
		try {
			await helper.process()
		} finally {
			delete process.env.AUDIBLE_BATCH_SIZE
			historyEnabled = false
		}

		const firstCall = showConstructorArgs.find((args) => args[0] === 'B000000001')
		const firstOptions = firstCall?.[3] as {
			prefetched?: unknown
			reservedGeneration?: number
		}
		expect(firstOptions.prefetched).toBeUndefined()
		expect(firstOptions.reservedGeneration).toBeUndefined()
	})

	test('prefetches multi-ASIN products when AUDIBLE_BATCH_SIZE >= 2', async () => {
		process.env.AUDIBLE_BATCH_SIZE = '50'
		mockFetch.mockResolvedValue({
			data: {
				products: [{ ...deepCopyProduct, asin: 'B000000001' }],
				response_groups: ['rating'],
				total_results: 1
			}
		})
		try {
			await helper.process()
		} finally {
			delete process.env.AUDIBLE_BATCH_SIZE
		}

		expect(mockFetch).toHaveBeenCalled()
		const firstCall = showConstructorArgs.find((args) => args[0] === 'B000000001')
		const firstOptions = firstCall?.[3] as { prefetched?: { receivedAt: Date } }
		expect(firstOptions.prefetched).toMatchObject({ receivedAt: expect.any(Date) })
		// One success per accepted chunk, at fetch time — only the US
		// chunk: the fixture answers the UK request with the US ASIN, and
		// the per-chunk membership guard discards the unsolicited product,
		// so the UK chunk's found set is empty and it registers nothing —
		// plus the 2 NON-prefetched books at consume time. The prefetched
		// B1 must not register a third per-book success (which would make
		// this 4).
		expect(mockRegisterSuccess).toHaveBeenCalledTimes(3)
	})

	test('paces the batch request, not every prefetched book', async () => {
		process.env.AUDIBLE_BATCH_SIZE = '50'
		// Both books are us-region, so the page is one 2-ASIN chunk. Pacing
		// belongs at that request boundary; a per-book jitter here would
		// multiply one batch by JITTER_MS per book and erase the win.
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0], books[2]]).mockResolvedValueOnce([])
		mockFetch.mockResolvedValue({
			data: {
				products: [
					{ ...deepCopyProduct, asin: 'B000000001' },
					{ ...deepCopyProduct, asin: 'B000000003' }
				],
				response_groups: ['rating'],
				total_results: 2
			}
		})
		try {
			await expect(helper.process()).resolves.toEqual({
				total: 2,
				updated: 2,
				skipped: 0,
				terminalSkipped: 0,
				failed: 0
			})
		} finally {
			delete process.env.AUDIBLE_BATCH_SIZE
		}

		expect(mockJitteredSleep).toHaveBeenCalledTimes(1)
		expect(mockSleepCooldown).toHaveBeenCalledTimes(1)
		expect(mockRegisterSuccess).toHaveBeenCalledTimes(1)
	})

	test('repairs ratings when the full document fails validation', async () => {
		// Legacy stubs miss validator-required content fields; the fetched
		// ratings block is still valid. The conditional direct write must
		// bypass validation and leave the row's other fields alone. This case
		// matches on the numeric driver code, not the message.
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockFreshData = bookWithRatings
		mockShowHandler.mockImplementation(async () => {
			const cause = Object.assign(new Error('write rejected'), { code: 121 })
			throw new Error('handler wrapper', {
				cause: new Error('An error occurred while updating book', { cause })
			})
		})

		await expect(helper.process()).resolves.toEqual({
			total: 1,
			updated: 1,
			skipped: 0,
			terminalSkipped: 0,
			failed: 0
		})
		expect(mockBookUpdateOne).toHaveBeenCalledWith(
			{ _id: books[0]._id, ratings: { $exists: false } },
			{
				$set: { ratings: bookWithRatings.ratings },
				$unset: { ratingsBackfillSkip: '' },
				$currentDate: { updatedAt: true }
			},
			{ bypassDocumentValidation: true }
		)
		expect(mockRegisterSuccess).toHaveBeenCalledTimes(1)
	})

	test('repairs ratings when validation is detected by message alone', async () => {
		// Driver errors can arrive without a usable numeric code after
		// wrapping; the message branch must still recognize the rejection.
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockFreshData = bookWithRatings
		mockShowHandler.mockImplementation(async () => {
			const cause = new Error('Document failed validation')
			throw new Error('handler wrapper', {
				cause: new Error('An error occurred while updating book', { cause })
			})
		})

		await expect(helper.process()).resolves.toEqual({
			total: 1,
			updated: 1,
			skipped: 0,
			terminalSkipped: 0,
			failed: 0
		})
		expect(mockBookUpdateOne).toHaveBeenCalledTimes(1)
	})

	test('counts a raced validation repair without registering success', async () => {
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockFreshData = bookWithRatings
		mockBookUpdateOne.mockResolvedValue({ modifiedCount: 0 })
		mockShowHandler.mockImplementation(async () => {
			const cause = Object.assign(new Error('write rejected'), { code: 121 })
			throw new Error('handler wrapper', {
				cause: new Error('An error occurred while updating book', { cause })
			})
		})

		await expect(helper.process()).resolves.toEqual({
			total: 1,
			updated: 0,
			skipped: 0,
			terminalSkipped: 0,
			failed: 0
		})
		expect(mockRegisterSuccess).not.toHaveBeenCalled()
	})

	test('does not take the validation repair path with history enabled', async () => {
		// History enabled: a validation rejection must NOT fall back to the
		// legacy papr write (which bypasses the generation fence). The
		// generation a real persistence attempt reserved (persistedGeneration)
		// is what the fenced repair is keyed on; with it set, the repair runs
		// through persistRatingsRepair. The fence is lost (superseded), so the
		// books write is not attempted and the book tallies as a race.
		historyEnabled = true
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockFreshData = bookWithRatings
		mockPersistedGeneration = 9
		mockPersistRatingsRepair.mockResolvedValue({ modified: 0, superseded: true })
		mockShowHandler.mockImplementation(async () => {
			const cause = Object.assign(new Error('write rejected'), { code: 121 })
			throw new Error('handler wrapper', {
				cause: new Error('An error occurred while updating book', { cause })
			})
		})

		try {
			await expect(helper.process()).resolves.toEqual({
				total: 1,
				updated: 0,
				skipped: 0,
				terminalSkipped: 0,
				failed: 0
			})
		} finally {
			historyEnabled = false
		}
		// The fenced repair was invoked (not the legacy papr write), keyed on
		// the reserved generation.
		expect(mockPersistRatingsRepair).toHaveBeenCalledTimes(1)
		expect(mockPersistRatingsRepair).toHaveBeenCalledWith({
			asin: books[0].asin,
			region: 'us',
			generation: 9,
			bookId: books[0]._id,
			ratings: bookWithRatings.ratings
		})
		expect(mockBookUpdateOne).not.toHaveBeenCalled()
	})

	test('invalidates the book cache after a successful ratings repair write', async () => {
		// The handler's rejection path cached the stored rating-less
		// projection; the repair changed only MongoDB, so reads would serve
		// the pre-repair projection for the whole TTL unless the key is
		// invalidated.
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockPersisted = false
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 1, skipped: 0, terminalSkipped: 0, failed: 0 })
		expect(mockRedisDel).toHaveBeenCalledTimes(1)
		// The key is built as `${region}-${type}-${asin}` from the SAME
		// values the handler cached with.
		expect(cacheDeleteOneCalls.at(-1)).toEqual([
			helper.redis,
			'book',
			books[0].asin,
			'us',
			helper.logger
		])
	})

	test('swallows a cache-deletion failure after the repair (best-effort)', async () => {
		// A cache outage here must not fail the book — the entry expires on
		// its TTL, and the MongoDB write already landed. The backfill calls
		// deleteOne() WITHOUT `{ log: false }`, so the real RedisHelper logs
		// the del failure itself and the repair still counts as updated.
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockPersisted = false
		mockRedisDel.mockRejectedValue(new Error('redis down'))
		const logger = createMockLogger()
		const withLogger = new BookBackfillHelper(logger, cacheClient)
		await expect(withLogger.process()).resolves.toEqual({ total: 1, updated: 1, skipped: 0, terminalSkipped: 0, failed: 0 })
		expect(mockRedisDel).toHaveBeenCalledTimes(1)
		// The real deleteOne logs the del failure (no `{ log: false }` on
		// this call site); the backfill then swallows the rethrown error, so
		// exactly one error line reports the cache outage.
		expect(logger.error).toHaveBeenCalledTimes(1)
		expect(logger.error).toHaveBeenCalledWith('redis down')
	})

	test('revalidates the generation fence atomically with the history-enabled repair', async () => {
		// A `rejected` disposition only proves non-staleness while
		// persistObservation's own transaction ran: a newer generation
		// accepted in between would let an older fetch's ratings land. The
		// history-enabled repair therefore re-runs the fence as part of the
		// conditional write, keyed by the generation the fetch was reserved
		// under, and must NOT fall back to the unguarded papr updateOne.
		historyEnabled = true
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockPersisted = false
		mockHistoryDisposition = 'rejected'
		mockPersistedGeneration = 9
		try {
			await expect(helper.process()).resolves.toEqual({ total: 1, updated: 1, skipped: 0, terminalSkipped: 0, failed: 0 })
			expect(mockPersistRatingsRepair).toHaveBeenCalledTimes(1)
			expect(mockPersistRatingsRepair).toHaveBeenCalledWith({
				asin: books[0].asin,
				region: 'us',
				generation: 9,
				bookId: books[0]._id,
				ratings: bookWithRatings.ratings
			})
			expect(mockBookUpdateOne).not.toHaveBeenCalled()
			expect(mockRedisDel).toHaveBeenCalledTimes(1)
		} finally {
			historyEnabled = false
		}
	})

	test('does not count or invalidate when the history-enabled repair lost the fence', async () => {
		// persistRatingsRepair reports the lost fence with its `superseded`
		// result (a newer writer owns the generation fence in between the
		// `rejected` disposition and the repair). The book must not count as
		// updated — it tallies as a race, NOT a batch failure — and the
		// cache entry (which still matches the stored row) must not be
		// invalidated: nothing was written. The fetch itself succeeded, so
		// the shared adaptive cooldown must still relax exactly as for any
		// other raced-but-fetched (non-prefetched) outcome.
		historyEnabled = true
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockPersisted = false
		mockHistoryDisposition = 'rejected'
		mockPersistedGeneration = 9
		mockPersistRatingsRepair.mockResolvedValue({ modified: 0, superseded: true })
		try {
			await expect(helper.process()).resolves.toEqual({
				total: 1,
				updated: 0,
				skipped: 0,
				terminalSkipped: 0,
				failed: 0
			})
			expect(mockPersistRatingsRepair).toHaveBeenCalledTimes(1)
			expect(mockRedisDel).not.toHaveBeenCalled()
			expect(mockRegisterSuccess).toHaveBeenCalledTimes(1)
		} finally {
			historyEnabled = false
		}
	})

	test('tallies a stale (un-repaired) book as raced, not updated', async () => {
		// The `stale` repair-skip must also remove the book from `updated`:
		// reporting an un-repaired row as updated would mislead the summary
		// (the book stays in the ratings target set and is re-walked).
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockPersisted = false
		mockHistoryDisposition = 'stale'
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 0, skipped: 0, terminalSkipped: 0, failed: 0 })
	})

	test('counts a concurrently deleted book as raced, not failed', async () => {
		// A book deleted after the keyset page read but before
		// persistObservation completes returns `stale` with no data, and the
		// show handler throws NotFoundError for it: a concurrent-delete race,
		// not a retryable failure. The row is gone, so it tallies into `raced`
		// (subtracted from `updated`) and the batch completes.
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockShowHandler.mockRejectedValue(new NotFoundError('Book B000000001 not found in region us'))
		await expect(helper.process()).resolves.toEqual({
			total: 1,
			updated: 0,
			skipped: 0,
			terminalSkipped: 0,
			failed: 0
		})
	})

	test('logs a status-bearing batch failure with its HTTP status and URL', async () => {
		// fetchPlus rejects exhausted HTTP failures with the AxiosResponse
		// DIRECTLY (status/config at top level), not nested under
		// `.response`: the diagnostic must not degrade to
		// "[object Object]" for a 400 (ASIN list/cap) or 503 (throttle).
		process.env.AUDIBLE_BATCH_SIZE = '50'
		const response = {
			status: 503,
			config: { url: 'https://api.audible.com/1.0/catalog/products?asins=B000000001' },
			data: { message: 'throttled' }
		}
		mockFetch.mockRejectedValue(response)
		const logger = createMockLogger()
		const withLogger = new BookBackfillHelper(logger)
		try {
			await withLogger.process()
		} finally {
			delete process.env.AUDIBLE_BATCH_SIZE
		}
		expect(mockFetch).toHaveBeenCalled()
		const warn = (logger.warn as ReturnType<typeof mock>).mock.calls.map((call) => String(call[0]))
		expect(warn).toEqual(
			expect.arrayContaining([
				expect.stringContaining('HTTP 503 for https://api.audible.com/1.0/catalog/products?asins=B000000001')
			])
		)
		// The diagnostic must never stringify the raw response object.
		expect(warn).not.toEqual(expect.arrayContaining([expect.stringContaining('[object Object]')]))
	})

	test('logs a nested AxiosError batch failure with its status and URL', async () => {
		// Transport-shaped rejections carry the status/config nested under
		// `.response`; both shapes must resolve the same diagnostic.
		process.env.AUDIBLE_BATCH_SIZE = '50'
		const nested = {
			response: {
				status: 400,
				config: { url: 'https://api.audible.de/1.0/catalog/products?asins=B000000001' }
			},
			message: 'Request failed with status code 400'
		}
		mockFetch.mockRejectedValue(nested)
		const logger = createMockLogger()
		const withLogger = new BookBackfillHelper(logger)
		try {
			await withLogger.process()
		} finally {
			delete process.env.AUDIBLE_BATCH_SIZE
		}
		const warn = (logger.warn as ReturnType<typeof mock>).mock.calls.map((call) => String(call[0]))
		expect(warn).toEqual(
			expect.arrayContaining([
				expect.stringContaining('HTTP 400 for https://api.audible.de/1.0/catalog/products?asins=B000000001')
			])
		)
	})

	test('reports real progress in the batch-disable diagnostic after successful chunks', async () => {
		// Three books in one region with a batch size of 2: the first chunk
		// succeeds, the second fails. The diagnostic must report the offset
		// where the failed chunk STARTS (2) — a frozen 0 would claim no
		// progress at all and hide how far the page got.
		process.env.AUDIBLE_BATCH_SIZE = '2'
		setPerformanceConfig(createTestPerformanceConfig({ SCHEDULER_ITEM_TIMEOUT_MS: 0 }))
		const usBooks = [
			{ _id: new ObjectId('5c8f8f8f8f8f8f8f8f8f8f01'), asin: 'B000000001', region: 'us' },
			{ _id: new ObjectId('5c8f8f8f8f8f8f8f8f8f8f02'), asin: 'B000000002', region: 'us' },
			{ _id: new ObjectId('5c8f8f8f8f8f8f8f8f8f8f03'), asin: 'B000000003', region: 'us' }
		]
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce(usBooks).mockResolvedValueOnce([])
		mockFetch
			.mockResolvedValueOnce({
				data: { products: [{ ...deepCopyProduct, asin: 'B000000001' }], response_groups: ['rating'], total_results: 1 }
			})
			.mockRejectedValueOnce(new Error('chunk failed'))
		const logger = createMockLogger()
		const withLogger = new BookBackfillHelper(logger)
		try {
			await withLogger.process()
		} finally {
			delete process.env.AUDIBLE_BATCH_SIZE
			resetPerformanceConfig()
		}
		const warn = (logger.warn as ReturnType<typeof mock>).mock.calls.map((call) => String(call[0]))
		expect(warn).toEqual(expect.arrayContaining([expect.stringContaining('offset 2')]))
	})

	test('disables batching when a chunk stays pending past the item deadline, then proceeds per book', async () => {
		// A stuck prefetch must surface as a failed chunk (disable batching
		// for the page) once the per-item deadline lapses, not park the
		// single-concurrency worker: the book then proceeds through the
		// proven per-book path with no prefetched product.
		process.env.AUDIBLE_BATCH_SIZE = '50'
		setPerformanceConfig(createTestPerformanceConfig({ SCHEDULER_ITEM_TIMEOUT_MS: 50 }))
		vi.useFakeTimers()
		try {
			mockBookFind.mockReset()
			mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
			// The batch request never settles: only the deadline can move it.
			// Resolve the barrier when the fetch fires, then hang — awaiting it
			// proves the prefetch started and its deadline timer is registered
			// (withDeadline sets the timer synchronously) before any timer is
			// advanced; counting microtask turns to guess that point is racy.
			const { promise: started, resolve: release } = Promise.withResolvers<void>()
			mockFetch.mockImplementation(() => {
				release()
				return new Promise<never>(() => {})
			})
			const pending = helper.process()
			await started
			vi.advanceTimersByTime(60)
			await expect(pending).resolves.toEqual({ total: 1, updated: 1, skipped: 0, terminalSkipped: 0, failed: 0 })
		} finally {
			vi.useRealTimers()
			resetPerformanceConfig()
			delete process.env.AUDIBLE_BATCH_SIZE
		}
		// Batching was attempted, then disabled by the deadline: the fetch
		// fired once, and the book reached the per-book fallback with NO
		// prefetched product (updated via the normal path).
		expect(mockFetch).toHaveBeenCalledTimes(1)
		expect(showConstructorArgs).toHaveLength(1)
		const options = showConstructorArgs[0][3] as { prefetched?: unknown }
		expect(options.prefetched).toBeUndefined()
	})

	test('aborts the batch request signal before the per-book fallback begins', async () => {
		// The batch fetch hangs past the per-item deadline: withDeadline's
		// onTimeout aborts the request's signal, and the catch disables
		// batching. The per-book fallback then runs — and by the time it
		// does, the batch signal must already be ABORTED (a late 503 from the
		// abandoned batch must not raise the shared adaptive cooldown after
		// the per-book fallback has started).
		process.env.AUDIBLE_BATCH_SIZE = '50'
		setPerformanceConfig(createTestPerformanceConfig({ SCHEDULER_ITEM_TIMEOUT_MS: 50 }))
		vi.useFakeTimers()
		let batchSignal: AbortSignal | undefined
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		const { promise: fetchStarted, resolve: releaseFetch } = Promise.withResolvers<void>()
		mockFetch.mockImplementation((url: string, options: { signal?: AbortSignal }) => {
			batchSignal = options?.signal
			releaseFetch()
			return new Promise<never>(() => {})
		})
		let signalAbortedAtFallback: boolean | undefined
		mockShowHandler.mockImplementation(async () => {
			signalAbortedAtFallback = batchSignal?.aborted
			return bookWithRatings
		})
		try {
			const pending = helper.process()
			// The batch request has fired (its signal captured) and its
			// deadline timer is armed; only the deadline can move it.
			await fetchStarted
			vi.advanceTimersByTime(60)
			await expect(pending).resolves.toEqual({
				total: 1,
				updated: 1,
				skipped: 0,
				terminalSkipped: 0,
				failed: 0
			})
		} finally {
			vi.useRealTimers()
			resetPerformanceConfig()
			delete process.env.AUDIBLE_BATCH_SIZE
		}
		// The batch request carried a signal, and by the time the per-book
		// fallback ran it had been aborted by the deadline.
		expect(batchSignal).toBeInstanceOf(AbortSignal)
		expect(signalAbortedAtFallback).toBe(true)
	})

	test('rejects a book when the handler exceeds the item deadline', async () => {
		// The backfill wraps each handler in withDeadline (same contract as
		// the scheduler walk): a hung fetch surfaces as a failure. Fake timers
		// drive the deadline deterministically — no real wall-clock wait.
		setPerformanceConfig(createTestPerformanceConfig({ SCHEDULER_ITEM_TIMEOUT_MS: 50 }))
		vi.useFakeTimers()
		try {
			mockBookFind.mockReset()
			mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
			const neverSettles = Promise.withResolvers<unknown>()
			mockShowHandler.mockImplementation(() => neverSettles.promise)
			const pending = helper.process()
			await Promise.resolve() // let the walk reach the awaited deadline
			vi.advanceTimersByTime(60)
			await expect(pending).resolves.toEqual({ total: 1, updated: 0, skipped: 0, terminalSkipped: 0, failed: 1 })
		} finally {
			vi.useRealTimers()
			resetPerformanceConfig()
		}
	})

	test('invalidates the book cache only after a timed-out fenced repair settles', async () => {
		// Regression: `withDeadline` only stops AWAITING the repair — the
		// background transaction can commit AFTER the deadline. Invalidating
		// at the timeout leaves a gap in which a concurrent read repopulates
		// the cache from the still-rating-less row, and the late commit
		// carries no further invalidation. The invalidation must land after
		// the repair SETTLES (commit or abort), not at the timeout.
		historyEnabled = true
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockPersisted = false
		mockPersistedGeneration = 9
		mockFreshData = bookWithRatings
		// The repair promise is held until the test resolves it. The `armed`
		// resolver signals the moment the repair is invoked — and so the
		// moment `withDeadline` has armed its deadline timer — so the timer
		// advance below fires against a pending repair (a single microtask
		// turn is not enough to reach the timer arm, and advancing with no
		// pending timer would let the repair resolve normally).
		const { promise: repairPromise, resolve: settleRepair } =
			Promise.withResolvers<{ modified: number; superseded: boolean }>()
		const { promise: repairArmed, resolve: signalArmed } = Promise.withResolvers<void>()
		mockPersistRatingsRepair.mockImplementation(() => {
			signalArmed()
			return repairPromise
		})
		mockShowHandler.mockImplementation(async () => {
			const cause = Object.assign(new Error('write rejected'), { code: 121 })
			throw new Error('handler wrapper', {
				cause: new Error('An error occurred while updating book', { cause })
			})
		})
		setPerformanceConfig(createTestPerformanceConfig({ SCHEDULER_ITEM_TIMEOUT_MS: 50 }))
		vi.useFakeTimers()
		try {
			const pending = helper.process()
			await repairArmed
			vi.advanceTimersByTime(60)
			// The deadline fired, but the repair has NOT settled yet: no
			// invalidation at timeout time.
			expect(mockRedisDel).not.toHaveBeenCalled()
			// The repair settles (commits) after the deadline: the
			// settlement observer must now invalidate.
			settleRepair({ modified: 1, superseded: false })
			// Flush the observer's microtask chain (catch → finally →
			// deleteOne) without touching the fake timers.
			for (let i = 0; i < 12; i++) await Promise.resolve()
			expect(mockRedisDel).toHaveBeenCalledTimes(1)
			// The item still counts failed: the timeout outcome is
			// preserved.
			await expect(pending).resolves.toEqual({
				total: 1,
				updated: 0,
				skipped: 0,
				terminalSkipped: 0,
				failed: 1
			})
		} finally {
			vi.useRealTimers()
			resetPerformanceConfig()
			historyEnabled = false
		}
	})

	test('invalidates the book cache only after a timed-out legacy repair settles', async () => {
		// The history-disabled path bounds the legacy `updateOne` the same
		// way: the invalidation must land after the write settles, not at
		// the timeout.
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockFreshData = bookWithRatings
		const { promise: repairPromise, resolve: settleRepair } =
			Promise.withResolvers<{ modifiedCount: number }>()
		const { promise: repairArmed, resolve: signalArmed } = Promise.withResolvers<void>()
		mockBookUpdateOne.mockImplementation(() => {
			signalArmed()
			return repairPromise
		})
		mockShowHandler.mockImplementation(async () => {
			const cause = Object.assign(new Error('write rejected'), { code: 121 })
			throw new Error('handler wrapper', {
				cause: new Error('An error occurred while updating book', { cause })
			})
		})
		setPerformanceConfig(createTestPerformanceConfig({ SCHEDULER_ITEM_TIMEOUT_MS: 50 }))
		vi.useFakeTimers()
		try {
			const pending = helper.process()
			await repairArmed
			vi.advanceTimersByTime(60)
			// The deadline fired, but the write has NOT settled yet: no
			// invalidation at timeout time.
			expect(mockRedisDel).not.toHaveBeenCalled()
			// The write settles (commits) after the deadline: the
			// settlement observer must now invalidate.
			settleRepair({ modifiedCount: 1 })
			for (let i = 0; i < 12; i++) await Promise.resolve()
			expect(mockRedisDel).toHaveBeenCalledTimes(1)
			await expect(pending).resolves.toEqual({
				total: 1,
				updated: 0,
				skipped: 0,
				terminalSkipped: 0,
				failed: 1
			})
		} finally {
			vi.useRealTimers()
			resetPerformanceConfig()
		}
	})
})

afterAll(() => {
	mock.restore()
})
