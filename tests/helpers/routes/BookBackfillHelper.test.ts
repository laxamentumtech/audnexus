import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'

const mockBookFind = mock()
const mockProcessBatchByRegion = mock()
const mockShowHandler = mock()
const showConstructorArgs: unknown[][] = []

mock.module('#config/models/Book', () => ({
	default: class BookModel {
		static find = mockBookFind
	}
}))

mock.module('#helpers/utils/batchProcessor', () => ({
	processBatchByRegion: mockProcessBatchByRegion
}))

mock.module('#helpers/routes/BookShowHelper', () => ({
	default: class MockBookShowHelper {
		constructor(...args: unknown[]) {
			showConstructorArgs.push(args)
		}
		handler = mockShowHandler
	}
}))

import { ObjectId } from 'mongodb'

import BookBackfillHelper from '#helpers/routes/BookBackfillHelper'
import { createMockLogger } from '#tests/setup/mockLogger'

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
			{ ratings: { $exists: false } },
			{ projection: { asin: 1, region: 1 }, sort: { _id: 1 }, limit: 1000 }
		)
		expect(mockBookFind).toHaveBeenNthCalledWith(
			2,
			{ ratings: { $exists: false }, _id: { $gt: books[books.length - 1]._id } },
			{ projection: { asin: 1, region: 1 }, sort: { _id: 1 }, limit: 1000 }
		)
	})

	test('forces a refetch for every book and falls back to the us region', async () => {
		await helper.process()
		expect(showConstructorArgs).toHaveLength(3)
		for (const args of showConstructorArgs) {
			expect(args[2]).toBeNull()
			expect(args[4]).toBe(true)
		}
		expect(showConstructorArgs[0][1]).toEqual({ region: 'us', update: '1' })
		expect(showConstructorArgs[1][1]).toEqual({ region: 'uk', update: '1' })
		expect(showConstructorArgs[2][1]).toEqual({ region: 'us', update: '1' })
	})

	test('maps the batch summary to the backfill result', async () => {
		await expect(helper.process()).resolves.toEqual({ total: 3, updated: 3, skipped: 0, failed: 0 })
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
		await expect(helper.process()).resolves.toEqual({ total: 5, updated: 5, skipped: 0, failed: 0 })
		expect(mockBookFind).toHaveBeenNthCalledWith(
			2,
			{ ratings: { $exists: false }, _id: { $gt: books[books.length - 1]._id } },
			{ projection: { asin: 1, region: 1 }, sort: { _id: 1 }, limit: 1000 }
		)
		expect(mockBookFind).toHaveBeenNthCalledWith(
			3,
			{ ratings: { $exists: false }, _id: { $gt: secondPage[secondPage.length - 1]._id } },
			{ projection: { asin: 1, region: 1 }, sort: { _id: 1 }, limit: 1000 }
		)
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
		// First page: one book without ratings (failed); second page: one
		// pre-order (skipped) — skipped counts as a batch success.
		mockShowHandler.mockImplementation(async () => {
			const asin = showConstructorArgs.at(-1)?.[0]
			return asin === 'B000000002' ? bookWithoutRatings : bookPreOrder
		})
		await expect(helper.process()).resolves.toEqual({ total: 4, updated: 2, skipped: 1, failed: 1 })
	})

	test('counts a book as failed when the refetch does not populate ratings', async () => {
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[1]]).mockResolvedValueOnce([])
		mockShowHandler.mockImplementation(async () => bookWithoutRatings)
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 0, skipped: 0, failed: 1 })
	})

	test('counts a book as failed when the handler returns undefined', async () => {
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce(books).mockResolvedValueOnce([])
		mockShowHandler.mockImplementation(async () => undefined)
		await expect(helper.process()).resolves.toEqual({ total: 3, updated: 0, skipped: 0, failed: 3 })
	})

	test('counts a pre-order book as skipped, not updated', async () => {
		mockBookFind.mockReset()
		mockBookFind.mockResolvedValueOnce([books[2]]).mockResolvedValueOnce([])
		mockShowHandler.mockImplementation(async () => bookPreOrder)
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 0, skipped: 1, failed: 0 })
	})
})

afterAll(() => {
	mock.restore()
})
