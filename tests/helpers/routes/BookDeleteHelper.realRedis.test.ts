import type { FastifyRedis } from '@fastify/redis'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { FastifyBaseLogger } from 'fastify'

// This file deliberately does NOT mock `#helpers/database/redis/RedisHelper`:
// the F9 single-log guarantee on the delete side is about the interaction
// between the `deleteOne({ log: false })` wrapper in `BookDeleteHelper` and
// the redis layer's own error handler. The underlying ioredis client is
// mocked (the established pattern from tests/database/redis/RedisHelper.test.ts)
// so the REAL `RedisHelper.deleteOne` runs and its catch block is exercised.
// The sibling `BookDeleteHelper.test.ts` stubs `deleteOne` itself (its mock
// logs nothing), so a missing `log: false` opt-out would be invisible there.

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
import { createMockLogger } from '#tests/setup/mockLogger'

describe('BookDeleteHelper history cache invalidation failure emits one log line (real redis layer)', () => {
	const asin = 'B079LRSMNN'
	const region = 'us'
	const options = { region, seedAuthors: undefined, update: undefined }
	let helper: BookDeleteHelper
	let mockLogger: FastifyBaseLogger
	let redisClient: FastifyRedis
	const savedEnv = process.env.BOOK_HISTORY_ENABLED

	beforeEach(() => {
		process.env.BOOK_HISTORY_ENABLED = 'true'
		mockLogger = createMockLogger()
		redisClient = {
			del: mock()
		} as unknown as FastifyRedis
		helper = new BookDeleteHelper(asin, options, redisClient, mockLogger)
		mockDeleteCurrent.mockClear()
		mockDeleteCurrent.mockResolvedValue({
			data: { acknowledged: true, deletedCount: 1 },
			modified: true
		})
	})

	afterEach(() => {
		if (savedEnv === undefined) delete process.env.BOOK_HISTORY_ENABLED
		else process.env.BOOK_HISTORY_ENABLED = savedEnv
	})

	test('real RedisHelper.deleteOne with a failing redis command logs exactly once', async () => {
		// The redis command itself rejects (not a deleteOne stub), so the real
		// RedisHelper.deleteOne catch block runs. Its `log: false` opt-out must
		// keep it silent; exactly one error line (the wrapper's) may appear.
		redisClient.del.mockRejectedValue(new Error('redis down'))

		const result = await helper.handler()

		expect(result).toBe(true)
		// The REAL redis command ran with the expected key — the failure
		// originated below RedisHelper, not at a deleteOne stub.
		expect(redisClient.del).toHaveBeenCalledTimes(1)
		expect(redisClient.del).toHaveBeenCalledWith(`${region}-book-${asin}`)
		// Exactly one error line: the wrapper's actionable message wrapping
		// the redis-layer rethrow. Without `log: false`, the redis layer
		// would log 'redis down' first and this count would be 2.
		expect(mockLogger.error).toHaveBeenCalledTimes(1)
		const message = (mockLogger.error as ReturnType<typeof mock>).mock.calls[0][0] as string
		expect(message).toBe(
			`History cache invalidation failed for book ${asin} (delete is committed): Error: An error occurred while deleting ${region}-book-${asin} in redis`
		)
	})
})
