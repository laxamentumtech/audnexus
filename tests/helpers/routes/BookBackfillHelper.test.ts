import { afterAll, beforeEach, describe, expect, mock, test, vi } from 'bun:test'

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

// Whether the stubbed show helper reports its full-document write as
// persisted; the backfill falls back to a direct ratings write when false.
let mockPersisted = false
// Fresh upstream data as the real helper exposes it; used when the handler
// resolves with the stored row (genre-guard rejection) instead.
let mockFreshData: unknown

mock.module('#helpers/routes/BookShowHelper', () => ({
	default: class MockBookShowHelper {
		constructor(...args: unknown[]) {
			showConstructorArgs.push(args)
		}
		handler = mockShowHandler
		persisted = mockPersisted
		freshData = mockFreshData
	}
}))

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
import { createMockLogger } from '#tests/setup/mockLogger'
import { createTestPerformanceConfig } from '#tests/setup/performanceConfig'

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

	beforeEach(() => {
		mock.clearAllMocks()
		mockSleepCooldown.mockResolvedValue(undefined)
		mockJitteredSleep.mockResolvedValue(undefined)
		mockBookUpdateOne.mockResolvedValue({ modified: 1 })
		mockMarkUpdateOne.mockResolvedValue({ modifiedCount: 1 })
		mockPersisted = false
		mockFreshData = undefined
		showConstructorArgs.length = 0
		helper = new BookBackfillHelper(createMockLogger())
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

	test('queries only books missing the ratings field in _id-ordered batches', async () => {
		await helper.process()
		expect(mockBookFind).toHaveBeenCalledTimes(2)
		expect(mockBookFind).toHaveBeenNthCalledWith(
			1,
			{ $and: [{ ratings: { $exists: false }, ratingsBackfillSkip: { $exists: false } }] },
			{ projection: { asin: 1, region: 1 }, sort: { _id: 1 }, limit: 1000 }
		)
		expect(mockBookFind).toHaveBeenNthCalledWith(
			2,
		{ $and: [{ ratings: { $exists: false }, ratingsBackfillSkip: { $exists: false } }, { _id: { $gt: books[books.length - 1]._id } }] },
		{ projection: { asin: 1, region: 1 }, sort: { _id: 1 }, limit: 1000 }
		)
	})

	test('forces a refetch for every book and falls back to the us region', async () => {
		await helper.process()
		expect(showConstructorArgs).toHaveLength(3)
		for (const args of showConstructorArgs) {
			expect(args[2]).toBeNull()
			expect(args[4]).toBe(true)
			// Ratings come from the API; the backfill skips the HTML scrape.
			expect(args[5]).toBe(true)
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
			{ $and: [{ ratings: { $exists: false }, ratingsBackfillSkip: { $exists: false } }, { _id: { $gt: books[books.length - 1]._id } }] },
			{ projection: { asin: 1, region: 1 }, sort: { _id: 1 }, limit: 1000 }
		)
		expect(mockBookFind).toHaveBeenNthCalledWith(
			3,
			{ $and: [{ ratings: { $exists: false }, ratingsBackfillSkip: { $exists: false } }, { _id: { $gt: secondPage[secondPage.length - 1]._id } }] },
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

	test('writes ratings directly when the full update was rejected', async () => {
		// Old catalog rows have no category ladders upstream, so
		// BookHistoryStore's genre safeguard rejects the full-document
		// update. The ratings block is a pure addition and must still land,
		// or the row never leaves the backfill's target set.
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockPersisted = false
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 1, skipped: 0, terminalSkipped: 0, failed: 0 })
		expect(mockBookUpdateOne).toHaveBeenCalledWith(
			{ _id: books[0]._id },
			{
				$set: { ratings: bookWithRatings.ratings },
				$unset: { ratingsBackfillSkip: '' },
				$currentDate: { updatedAt: true }
			}
		)
	})

	test('uses the fresh ratings when the handler resolved with the stored row', async () => {
		// Genre-less rows make BookHistoryStore reject the full update and the
		// handler returns the old stored record without ratings; the fresh
		// fetch's ratings block must still be written.
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[0]]).mockResolvedValueOnce([])
		mockShowHandler.mockImplementation(async () => bookWithoutRatings)
		mockFreshData = bookWithRatings
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 1, skipped: 0, terminalSkipped: 0, failed: 0 })
		expect(mockBookUpdateOne).toHaveBeenCalledWith(
			{ _id: books[0]._id },
			{
				$set: { ratings: bookWithRatings.ratings },
				$unset: { ratingsBackfillSkip: '' },
				$currentDate: { updatedAt: true }
			}
		)
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
			expect.any(Array),
			{ bypassDocumentValidation: true }
		)
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
})

afterAll(() => {
	mock.restore()
})
