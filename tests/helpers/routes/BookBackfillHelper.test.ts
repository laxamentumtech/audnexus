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

import BookBackfillHelper from '#helpers/routes/BookBackfillHelper'
import { createMockLogger } from '#tests/setup/mockLogger'

const books = [
	{ asin: 'B000000001', region: 'us' },
	{ asin: 'B000000002', region: 'uk' },
	{ asin: 'B000000003', region: null }
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
		mockBookFind.mockResolvedValue(books)
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

	test('queries only books missing the ratings field, sorted by updatedAt desc', async () => {
		await helper.process()
		expect(mockBookFind).toHaveBeenCalledTimes(1)
		expect(mockBookFind).toHaveBeenCalledWith(
			{ ratings: { $exists: false } },
			{ projection: { asin: 1, region: 1 }, sort: { updatedAt: -1 }, allowDiskUse: true }
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

	test('counts a book as failed when the refetch does not populate ratings', async () => {
		mockBookFind.mockResolvedValue([books[1]])
		mockShowHandler.mockImplementation(async () => bookWithoutRatings)
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 0, skipped: 0, failed: 1 })
	})

	test('counts a book as failed when the handler returns undefined', async () => {
		mockShowHandler.mockImplementation(async () => undefined)
		await expect(helper.process()).resolves.toEqual({ total: 3, updated: 0, skipped: 0, failed: 3 })
	})

	test('counts a pre-order book as skipped, not updated', async () => {
		mockBookFind.mockResolvedValue([books[2]])
		mockShowHandler.mockImplementation(async () => bookPreOrder)
		await expect(helper.process()).resolves.toEqual({ total: 1, updated: 0, skipped: 1, failed: 0 })
	})
})

afterAll(() => {
	mock.restore()
})
