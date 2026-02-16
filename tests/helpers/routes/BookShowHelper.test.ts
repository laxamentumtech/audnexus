jest.mock('#config/models/Book')
jest.mock('#helpers/database/papr/audible/PaprAudibleBookHelper')
jest.mock('#helpers/books/audible/StitchHelper')
jest.mock('#helpers/database/redis/RedisHelper')
jest.mock('#helpers/utils/fetchPlus')
jest.mock('@fastify/redis')

import type { FastifyRedis } from '@fastify/redis'
import type { AxiosResponse } from 'axios'
import { DeepMockProxy, mockDeep } from 'jest-mock-extended'

import {
	PerformanceConfig,
	resetPerformanceConfig,
	setPerformanceConfig
} from '#config/performance'
import { ApiBook } from '#config/types'
import StitchHelper from '#helpers/books/audible/StitchHelper'
import BookShowHelper from '#helpers/routes/BookShowHelper'
import * as fetchPlus from '#helpers/utils/fetchPlus'
import {
	bookWithoutProjection,
	bookWithoutProjectionUpdatedNow,
	parsedBook
} from '#tests/datasets/helpers/books'

type MockContext = {
	client: DeepMockProxy<FastifyRedis>
}

let asin: string
let ctx: MockContext
let helper: BookShowHelper

const createMockContext = (): MockContext => {
	return {
		client: mockDeep<FastifyRedis>()
	}
}

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

beforeEach(() => {
	asin = 'B079LRSMNN'
	helper = new BookShowHelper(
		asin,
		{ region: 'us', seedAuthors: undefined, update: undefined },
		null
	)
	jest
		.spyOn(helper.paprHelper, 'createOrUpdate')
		.mockResolvedValue({ data: parsedBook, modified: true })
	jest
		.spyOn(helper.paprHelper, 'findOne')
		.mockResolvedValue({ data: bookWithoutProjection, modified: false })
	jest.spyOn(StitchHelper.prototype, 'process').mockResolvedValue(parsedBook)
	jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(parsedBook)
	jest
		.spyOn(helper.paprHelper, 'findOneWithProjection')
		.mockResolvedValue({ data: parsedBook, modified: false })
	jest
		.spyOn(fetchPlus, 'default')
		.mockImplementation(() => Promise.resolve({ status: 200 } as AxiosResponse))
	jest.spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(parsedBook)
	jest.spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(false)
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
		jest.spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(true)
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
		jest.spyOn(helper.paprHelper, 'findOne').mockResolvedValue({ data: null, modified: false })
		await expect(helper.handler()).resolves.toStrictEqual(parsedBook)
	})

	test('run handler and update an existing book', async () => {
		helper = new BookShowHelper(asin, { region: 'us', seedAuthors: undefined, update: '1' }, null)
		// Need to re-do mock since helper reset
		jest
			.spyOn(helper.paprHelper, 'findOne')
			.mockResolvedValue({ data: bookWithoutProjection, modified: false })
		jest
			.spyOn(helper.paprHelper, 'createOrUpdate')
			.mockResolvedValue({ data: parsedBook, modified: true })
		jest
			.spyOn(helper.paprHelper, 'findOneWithProjection')
			.mockResolvedValue({ data: parsedBook, modified: false })
		jest.spyOn(StitchHelper.prototype, 'process').mockResolvedValue(parsedBook)
		jest.spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(parsedBook)
		jest.spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(false)
		await expect(helper.handler()).resolves.toStrictEqual(parsedBook)
	})

	test('run handler for an existing book in redis', async () => {
		ctx = createMockContext()
		helper = new BookShowHelper(
			asin,
			{ region: 'us', seedAuthors: undefined, update: '0' },
			ctx.client
		)
		jest.spyOn(helper.redisHelper, 'findOne').mockResolvedValue(parsedBook)
		await expect(helper.handler()).resolves.toStrictEqual(parsedBook)
		expect(helper.redisHelper.findOne).toHaveBeenCalledTimes(1)
	})

	test('run handler for an existing book', async () => {
		jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(undefined)
		await expect(helper.handler()).resolves.toStrictEqual(parsedBook)
	})

	test('run handler for an existing book in redis', async () => {
		await expect(helper.handler()).resolves.toStrictEqual(parsedBook)
	})
})

describe('BookShowHelper should throw error when', () => {
	test('getDataWithProjection is not a book type', async () => {
		jest
			.spyOn(helper.paprHelper, 'findOneWithProjection')
			.mockResolvedValue({ data: null, modified: false })
		await expect(helper.getDataWithProjection()).rejects.toThrow(
			`Data type for ${asin} is not ApiBook`
		)
	})

	test('getDataWithProjection sorted book is not a book type', async () => {
		// Enable USE_SORTED_KEYS to test sorting error handling
		setPerformanceConfig(createTestConfig({ USE_SORTED_KEYS: true }))
		jest.spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(null as unknown as ApiBook)
		await expect(helper.getDataWithProjection()).rejects.toThrow(
			`Data type for ${asin} is not ApiBook`
		)
	})

	test('createOrUpdateData is not a book type', async () => {
		jest
			.spyOn(helper.paprHelper, 'createOrUpdate')
			.mockResolvedValue({ data: null, modified: false })
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
		jest.spyOn(helper.paprHelper, 'createOrUpdate').mockRejectedValue(new Error('error'))
		helper.originalData = bookWithoutProjection
		await expect(helper.updateActions()).rejects.toThrow('error')
	})
})
