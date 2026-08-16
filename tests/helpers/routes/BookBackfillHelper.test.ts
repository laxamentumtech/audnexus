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

describe('BookBackfillHelper should', () => {
	let helper: BookBackfillHelper

	beforeEach(() => {
		mock.clearAllMocks()
		showConstructorArgs.length = 0
		helper = new BookBackfillHelper(createMockLogger())
		mockBookFind.mockResolvedValue(books)
		mockShowHandler.mockResolvedValue(undefined)
		mockProcessBatchByRegion.mockImplementation(async (_items: unknown[], processor: (item: unknown) => Promise<unknown>) => {
			await Promise.all(books.map((book) => processor(book)))
			return {
				results: [],
				summary: { total: 3, success: 2, failures: 1, regions: {}, maxConcurrencyObserved: 1 }
			}
		})
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
		await expect(helper.process()).resolves.toEqual({ total: 3, updated: 2, failed: 1 })
	})
})

afterAll(() => {
	mock.restore()
})
