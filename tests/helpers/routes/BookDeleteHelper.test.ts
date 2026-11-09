import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import type { FastifyBaseLogger } from 'fastify'

const mockDeleteCurrent = mock(() =>
	Promise.resolve({ data: { acknowledged: true, deletedCount: 1 }, modified: true })
)

mock.module('#config/papr', () => ({
	bookHistoryStore: {
		deleteCurrent: mockDeleteCurrent
	}
}))

mock.module('#config/models/Book', () => ({
	default: class BookModel {
		static findOne = () => Promise.resolve(null)
	}
}))

import BookDeleteHelper from '#helpers/routes/BookDeleteHelper'
import { bookWithoutProjection } from '#tests/datasets/helpers/books'
import { createMockLogger } from '#tests/setup/mockLogger'

describe('BookDeleteHelper history-mode delete contract', () => {
	const asin = 'B079LRSMNN'
	const region = 'us'
	const options = { region, seedAuthors: undefined, update: undefined }
	let helper: BookDeleteHelper
	let mockLogger: FastifyBaseLogger
	let savedEnv: string | undefined

	beforeEach(() => {
		savedEnv = process.env.BOOK_HISTORY_ENABLED
		mockLogger = createMockLogger()
		helper = new BookDeleteHelper(asin, options, null, mockLogger)
	})

	afterEach(() => {
		if (savedEnv === undefined) delete process.env.BOOK_HISTORY_ENABLED
		else process.env.BOOK_HISTORY_ENABLED = savedEnv
	})

	test('history enabled + deletedCount 1 → true, book removed, redis cleared', async () => {
		process.env.BOOK_HISTORY_ENABLED = 'true'
		mockDeleteCurrent.mockClear()
		mockDeleteCurrent.mockResolvedValue({
			data: { acknowledged: true, deletedCount: 1 },
			modified: true
		})
		const deleteOneSpy = spyOn(helper.redisHelper, 'deleteOne').mockResolvedValue(true)
		spyOn(helper.paprHelper, 'delete')

		const result = await helper.handler()

		expect(result).toBe(true)
		expect(mockDeleteCurrent).toHaveBeenCalledTimes(1)
		expect(mockDeleteCurrent).toHaveBeenCalledWith(asin, region)
		// The legacy papr delete must not run: identity was verified
		// transactionally by the store, not re-deleted by asin.
		expect(helper.paprHelper.delete).not.toHaveBeenCalled()
		// The redis cache is only cleared after a confirmed deletion.
		expect(deleteOneSpy).toHaveBeenCalledTimes(1)
	})

	test('history enabled + deletedCount 0 → false, no redis/cache write', async () => {
		process.env.BOOK_HISTORY_ENABLED = 'true'
		mockDeleteCurrent.mockClear()
		mockDeleteCurrent.mockResolvedValue({
			data: { acknowledged: true, deletedCount: 0 },
			modified: false
		})
		const deleteOneSpy = spyOn(helper.redisHelper, 'deleteOne').mockResolvedValue(false)
		spyOn(helper.paprHelper, 'delete')

		const result = await helper.handler()

		expect(result).toBe(false)
		expect(mockDeleteCurrent).toHaveBeenCalledTimes(1)
		expect(mockDeleteCurrent).toHaveBeenCalledWith(asin, region)
		// Nothing was deleted: the cache must be left untouched.
		expect(deleteOneSpy).not.toHaveBeenCalled()
		expect(helper.paprHelper.delete).not.toHaveBeenCalled()
	})

	test('history enabled + cache invalidation failure → true, single error log', async () => {
		process.env.BOOK_HISTORY_ENABLED = 'true'
		mockDeleteCurrent.mockClear()
		mockDeleteCurrent.mockResolvedValue({
			data: { acknowledged: true, deletedCount: 1 },
			modified: true
		})
		// Post-commit invalidation is best-effort: a cache failure must not
		// turn a committed delete into a 500 — the handler swallows it and
		// logs it exactly once (the mock `deleteOne` logs nothing itself).
		spyOn(helper.redisHelper, 'deleteOne').mockRejectedValue(new Error('redis down'))

		const result = await helper.handler()

		expect(result).toBe(true)
		expect(mockLogger.error).toHaveBeenCalledTimes(1)
		const message = (mockLogger.error as ReturnType<typeof mock>).mock.calls[0][0] as string
		expect(message).toContain('History cache invalidation failed')
		expect(message).toContain(asin)
	})

	test('history disabled → legacy deleteActions path runs', async () => {
		process.env.BOOK_HISTORY_ENABLED = 'false'
		mockDeleteCurrent.mockClear()
		spyOn(helper, 'getBookFromPapr').mockResolvedValue(bookWithoutProjection)
		const deleteOneSpy = spyOn(helper.redisHelper, 'deleteOne').mockResolvedValue(true)
		spyOn(helper.paprHelper, 'delete').mockResolvedValue({
			data: { acknowledged: true, deletedCount: 1 },
			modified: true
		})

		const result = await helper.handler()

		expect(result).toBe(true)
		expect(mockDeleteCurrent).not.toHaveBeenCalled()
		// Legacy path: redis cache cleared, then the papr delete runs.
		expect(deleteOneSpy).toHaveBeenCalledTimes(1)
		expect(helper.paprHelper.delete).toHaveBeenCalledTimes(1)
	})

	test('history disabled + book absent → false without any delete action', async () => {
		process.env.BOOK_HISTORY_ENABLED = 'false'
		spyOn(helper, 'getBookFromPapr').mockResolvedValue(null)
		const deleteOneSpy = spyOn(helper.redisHelper, 'deleteOne').mockResolvedValue(true)
		spyOn(helper.paprHelper, 'delete')

		const result = await helper.handler()

		expect(result).toBe(false)
		expect(mockDeleteCurrent).not.toHaveBeenCalled()
		expect(deleteOneSpy).not.toHaveBeenCalled()
		expect(helper.paprHelper.delete).not.toHaveBeenCalled()
	})
})

afterAll(() => {
	mock.restore()
})
