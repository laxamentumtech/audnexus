import type { FastifyRedis } from '@fastify/redis'
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import type { FastifyBaseLogger } from 'fastify'

// This file deliberately does NOT mock `#helpers/database/redis/RedisHelper`:
// the F9 single-log guarantee is about the interaction between the
// `cacheBookBestEffort` wrapper (`log: false` opt-out) and the redis layer's
// own error handler. The underlying ioredis client is mocked (the
// established pattern from tests/database/redis/RedisHelper.test.ts) so the
// REAL `RedisHelper.setOne` runs and its catch block is exercised.

mock.module('#helpers/database/papr/audible/PaprAudibleBookHelper', () => {
	return {
		default: class PaprAudibleBookHelper {
			findOne = () => Promise.resolve({ data: null, modified: false })
			findOneWithProjection = () => Promise.resolve({ data: null })
			setData = () => {}
			createOrUpdate = () => Promise.resolve({ data: null })
		}
	}
})

const mockReserveGeneration = mock(() => Promise.resolve(7))
const mockPersistObservation = mock(() =>
	Promise.resolve({ data: null, modified: false, disposition: 'accepted' as const })
)
const mockStitchProcess = mock(() => Promise.resolve(undefined))
let mockStitchObservation: BookObservation | undefined = undefined

mock.module('#config/papr', () => ({
	bookHistoryStore: {
		reserveGeneration: mockReserveGeneration,
		persistObservation: mockPersistObservation
	}
}))

mock.module('#helpers/books/audible/StitchHelper', () => ({
	default: class StitchHelper {
		process = () => mockStitchProcess()
		getHistoryObservation = () => mockStitchObservation
	}
}))

import type { BookObservation } from '#config/bookHistory'
import type { ApiBook } from '#config/types'
import GenericShowHelper from '#helpers/routes/GenericShowHelper'
import { bookWithoutProjection } from '#tests/datasets/helpers/books'
import { createMockLogger } from '#tests/setup/mockLogger'

describe('GenericShowHelper history cache refresh failure emits one log line (real redis layer)', () => {
	const asin = 'B079LRSMNN'
	const region = 'us'
	let helper: GenericShowHelper
	let mockLogger: FastifyBaseLogger
	let redisClient: FastifyRedis
	const savedEnv = process.env.BOOK_HISTORY_ENABLED

	const storedBook = {
		...(bookWithoutProjection as unknown as ApiBook),
		releaseDate: new Date('2019-06-01')
	} as ApiBook
	const observation: BookObservation = {
		observedAt: new Date('2026-11-07T12:00:00.000Z'),
		apiReceivedAt: new Date('2026-11-07T12:00:00.000Z'),
		responseGroups: ['category_ladders'],
		requestedRenditions: ['500', '1024'],
		fields: [
			{
				field: 'title',
				policy: 'editorial:title:v1',
				value: { state: 'value', value: 'Galaxy' },
				source: 'audible_api'
			}
		],
		artwork: []
	}

	beforeEach(() => {
		process.env.BOOK_HISTORY_ENABLED = 'true'
		mockLogger = createMockLogger()
		redisClient = {
			del: mock(),
			get: mock(),
			set: mock(),
			expire: mock()
		} as unknown as FastifyRedis
		helper = new GenericShowHelper(
			asin,
			{ region, seedAuthors: undefined, update: '1' },
			redisClient,
			'book',
			mockLogger
		)
		spyOn(helper, 'isUpdatedRecently').mockReturnValue(false)
		spyOn(helper, 'getDataFromPapr').mockResolvedValue(bookWithoutProjection)
		mockPersistObservation.mockClear()
		mockPersistObservation.mockResolvedValue({
			data: storedBook,
			modified: true,
			disposition: 'accepted'
		})
		mockStitchProcess.mockClear()
		mockStitchProcess.mockResolvedValue(storedBook)
		mockStitchObservation = observation
	})

	afterEach(() => {
		if (savedEnv === undefined) delete process.env.BOOK_HISTORY_ENABLED
		else process.env.BOOK_HISTORY_ENABLED = savedEnv
	})

	test('real RedisHelper.setOne with a failing redis command logs exactly once', async () => {
		// The redis command itself rejects (not a setOne stub), so the real
		// RedisHelper.setOne catch block runs. Its `log: false` opt-out must
		// keep it silent; exactly one error line (the wrapper's) may appear.
		redisClient.get.mockResolvedValue(null)
		redisClient.set.mockRejectedValue(new Error('redis down'))

		const result = (await helper.handler()) as ApiBook

		expect(result).toBe(storedBook)
		// The REAL redis command ran with the expected key and payload —
		// the failure originated below RedisHelper, not at a setOne stub.
		expect(redisClient.set).toHaveBeenCalledTimes(1)
		expect(redisClient.set).toHaveBeenCalledWith(
			`${region}-book-${asin}`,
			JSON.stringify(storedBook)
		)
		// Exactly one error line: the wrapper's actionable message wrapping
		// the redis-layer rethrow. Without `log: false`, the redis layer
		// would log 'redis down' first and this count would be 2.
		expect(mockLogger.error).toHaveBeenCalledTimes(1)
		const message = (mockLogger.error as ReturnType<typeof mock>).mock.calls[0][0] as string
		expect(message).toBe(
			`History cache refresh failed for book ${asin} (data is persisted): Error: An error occurred while setting ${region}-book-${asin} in redis`
		)
	})
})
