import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'

const mockBookFindOne = mock()
const mockBookFind = mock()
const mockPaprFindOne = mock()
const mockPaprFindOneWithProjection = mock()
const mockPaprCreateOrUpdate = mock()
const mockStitchProcess = mock()
const mockRedisFindOne = mock()
const mockRedisFindOrCreate = mock()
const mockRedisSetOne = mock()
const mockRedisSetExpiration = mock()
const mockRedisDeleteOne = mock()
const mockFetchPlus = mock()

mock.module('#config/models/Book', () => ({
	default: class BookModel {
		static findOne = mockBookFindOne
		static find = mockBookFind
	}
}))

mock.module('#helpers/database/papr/audible/PaprAudibleBookHelper', () => ({
	default: class PaprAudibleBookHelper {
		findOne = mockPaprFindOne
		findOneWithProjection = mockPaprFindOneWithProjection
		createOrUpdate = mockPaprCreateOrUpdate
		setData = mock()
	}
}))

mock.module('#helpers/books/audible/StitchHelper', () => ({
	default: class StitchHelper {
		process = mockStitchProcess
	}
}))

mock.module('#helpers/database/redis/RedisHelper', () => ({
	default: class RedisHelper {
		findOne = mockRedisFindOne
		findOrCreate = mockRedisFindOrCreate
		setOne = mockRedisSetOne
		setExpiration = mockRedisSetExpiration
		deleteOne = mockRedisDeleteOne
	}
}))

mock.module('#helpers/utils/fetchPlus', () => ({
	default: mockFetchPlus
}))

mock.module('@fastify/redis', () => ({}))

import type { FastifyRedis } from '@fastify/redis'
import type { AxiosResponse } from 'axios'

import {
	PerformanceConfig,
	resetPerformanceConfig,
	setPerformanceConfig
} from '#config/performance'
import { ApiBook } from '#config/types'
import BookShowHelper from '#helpers/routes/BookShowHelper'
import {
	bookWithoutProjection,
	bookWithoutProjectionUpdatedNow,
	parsedBook
} from '#tests/datasets/helpers/books'

const createTestConfig = (overrides: Partial<PerformanceConfig>): PerformanceConfig => ({
	USE_PARALLEL_SCHEDULER: false,
	USE_CONNECTION_POOLING: true,
	USE_COMPACT_JSON: true,
	USE_SORTED_KEYS: false,
	CIRCUIT_BREAKER_ENABLED: true,
	METRICS_ENABLED: true,
	MAX_CONCURRENT_REQUESTS: 50,
	SCHEDULER_CONCURRENCY: 5,
	SCHEDULER_MAX_PER_REGION: 5,
	DEFAULT_REGION: 'us',
	...overrides
})

type MockContext = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	client: any
}

let asin: string
let ctx: MockContext
let helper: BookShowHelper

const createMockContext = (): MockContext => {
	return {
		client: {
			get: mock(),
			set: mock(),
			del: mock(),
			ping: mock(),
			expire: mock()
		} as unknown as FastifyRedis
	}
}

beforeEach(() => {
	mock.clearAllMocks()
	asin = 'B079LRSMNN'
	helper = new BookShowHelper(
		asin,
		{ region: 'us', seedAuthors: undefined, update: undefined },
		null
	)
	mockPaprCreateOrUpdate.mockResolvedValue({ data: parsedBook, modified: true })
	mockPaprFindOne.mockResolvedValue({ data: bookWithoutProjection, modified: false })
	mockStitchProcess.mockResolvedValue(parsedBook)
	mockRedisFindOrCreate.mockResolvedValue(parsedBook)
	mockPaprFindOneWithProjection.mockResolvedValue({ data: parsedBook, modified: false })
	mockFetchPlus.mockImplementation(() => Promise.resolve({ status: 200 } as AxiosResponse))
	spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(parsedBook)
	spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(false)
})

afterEach(() => {
	resetPerformanceConfig()
})

describe('BookShowHelper should', () => {
	test('get a book from Papr', async () => {
		await expect(helper.getDataFromPapr()).resolves.toBe(bookWithoutProjection)
	})

	test('get new book data', async () => {
		await expect(helper.getNewData()).resolves.toBe(parsedBook)
	})

	test('create or update a book', async () => {
		await expect(helper.createOrUpdateData()).resolves.toStrictEqual(parsedBook)
	})

	test('returns original book if it was updated recently when trying to update', async () => {
		spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(true)
		helper.originalData = bookWithoutProjectionUpdatedNow
		await expect(helper.updateActions()).resolves.toStrictEqual(parsedBook)
	})

	test('isUpdatedRecently returns false if no originalData is present', () => {
		expect(helper.isUpdatedRecently()).toBe(false)
	})

	test('run all update actions', async () => {
		helper.originalData = bookWithoutProjection
		await expect(helper.updateActions()).resolves.toStrictEqual(parsedBook)
	})

	test('run handler for a new book', async () => {
		mockPaprFindOne.mockResolvedValue({ data: null, modified: false })
		await expect(helper.handler()).resolves.toStrictEqual(parsedBook)
	})

	test('run handler and update an existing book', async () => {
		helper = new BookShowHelper(asin, { region: 'us', seedAuthors: undefined, update: '1' }, null)
		mockPaprFindOne.mockResolvedValue({ data: bookWithoutProjection, modified: false })
		mockPaprCreateOrUpdate.mockResolvedValue({ data: parsedBook, modified: true })
		mockPaprFindOneWithProjection.mockResolvedValue({ data: parsedBook, modified: false })
		mockStitchProcess.mockResolvedValue(parsedBook)
		spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(parsedBook)
		spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(false)
		await expect(helper.handler()).resolves.toStrictEqual(parsedBook)
	})

	test('run handler for an existing book in redis', async () => {
		ctx = createMockContext()
		helper = new BookShowHelper(
			asin,
			{ region: 'us', seedAuthors: undefined, update: '0' },
			ctx.client
		)
		mockRedisFindOne.mockResolvedValue(parsedBook)
		await expect(helper.handler()).resolves.toStrictEqual(parsedBook)
		expect(helper.redisHelper.findOne).toHaveBeenCalledTimes(1)
	})

	test('run handler for an existing book', async () => {
		mockRedisFindOrCreate.mockResolvedValue(undefined)
		await expect(helper.handler()).resolves.toStrictEqual(parsedBook)
	})

	test('run handler for an existing book in redis', async () => {
		await expect(helper.handler()).resolves.toStrictEqual(parsedBook)
	})
})

describe('BookShowHelper should throw error when', () => {
	test('getDataWithProjection is not a book type', async () => {
		mockPaprFindOneWithProjection.mockResolvedValue({ data: null, modified: false })
		await expect(helper.getDataWithProjection()).rejects.toThrow(
			`Data type for ${asin} is not ApiBook`
		)
	})

	test('getDataWithProjection sorted book is not a book type', async () => {
		setPerformanceConfig(createTestConfig({ USE_SORTED_KEYS: true }))
		spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(null as unknown as ApiBook)
		await expect(helper.getDataWithProjection()).rejects.toThrow(
			`Data type for ${asin} is not ApiBook`
		)
	})

	test('createOrUpdateData is not a book type', async () => {
		mockPaprCreateOrUpdate.mockResolvedValue({ data: null, modified: false })
		await expect(helper.createOrUpdateData()).rejects.toThrow(
			`Data type for ${asin} is not ApiBook`
		)
	})

	test('update has no originalData', async () => {
		helper.originalData = null
		await expect(helper.updateActions()).rejects.toThrow(
			`Missing original book data for ASIN: ${asin}`
		)
	})

	test('updateActions fails to update', async () => {
		mockPaprCreateOrUpdate.mockRejectedValue(new Error('error'))
		helper.originalData = bookWithoutProjection
		await expect(helper.updateActions()).rejects.toThrow('error')
	})
})

afterAll(() => {
	mock.restore()
})
