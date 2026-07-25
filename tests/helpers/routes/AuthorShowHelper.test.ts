import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'

const mockAuthorFindOne = mock()
const mockAuthorFind = mock()
const mockPaprFindOne = mock()
const mockPaprFindOneWithProjection = mock()
const mockPaprCreateOrUpdate = mock()
const mockPaprFindByName = mock()
const mockScrapeProcess = mock()
const mockRedisFindOne = mock()
const mockRedisFindOrCreate = mock()
const mockRedisSetOne = mock()
const mockRedisSetExpiration = mock()
const mockRedisDeleteOne = mock()

mock.module('#config/models/Author', () => ({
	default: class AuthorModel {
		static findOne = mockAuthorFindOne
		static find = mockAuthorFind
	}
}))

mock.module('#helpers/database/papr/audible/PaprAudibleAuthorHelper', () => ({
	default: class PaprAudibleAuthorHelper {
		findOne = mockPaprFindOne
		findOneWithProjection = mockPaprFindOneWithProjection
		createOrUpdate = mockPaprCreateOrUpdate
		findByName = mockPaprFindByName
		setData = mock()
	}
}))

mock.module('#helpers/authors/audible/ScrapeHelper', () => ({
	default: class ScrapeHelper {
		process = mockScrapeProcess
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

mock.module('@fastify/redis', () => ({}))

import type { FastifyRedis } from '@fastify/redis'

import {
	PerformanceConfig,
	resetPerformanceConfig,
	setPerformanceConfig
} from '#config/performance'
import { ApiAuthorProfile } from '#config/types'
import AuthorShowHelper from '#helpers/routes/AuthorShowHelper'
import {
	authorWithoutProjection,
	authorWithoutProjectionUpdatedNow,
	parsedAuthor
} from '#tests/datasets/helpers/authors'

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
let helper: AuthorShowHelper

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
	helper = new AuthorShowHelper(asin, { region: 'us', update: undefined }, null)
	mockPaprCreateOrUpdate.mockResolvedValue({ data: parsedAuthor, modified: true })
	mockPaprFindOne.mockResolvedValue({ data: authorWithoutProjection, modified: false })
	mockScrapeProcess.mockResolvedValue(parsedAuthor)
	mockRedisFindOrCreate.mockResolvedValue(parsedAuthor)
	mockPaprFindOneWithProjection.mockResolvedValue({ data: parsedAuthor, modified: false })
	spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(parsedAuthor)
	spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(false)
})

afterEach(() => {
	resetPerformanceConfig()
})

describe('AuthorShowHelper should', () => {
	test('get a author from Papr', async () => {
		await expect(helper.getDataFromPapr()).resolves.toStrictEqual(authorWithoutProjection)
	})

	test('get authors by name from Papr', async () => {
		const authors = [{ asin: 'B079LRSMNN', name: 'John Doe' }]
		const obj = { data: authors, modified: false }
		helper = new AuthorShowHelper('', { name: 'John Doe', region: 'us', update: undefined }, null)
		mockPaprFindByName.mockResolvedValue(obj)
		await expect(helper.getAuthorsByName()).resolves.toStrictEqual(authors)
	})

	test('get new author data', async () => {
		await expect(helper.getNewData()).resolves.toStrictEqual(parsedAuthor)
	})

	test('create or update a author', async () => {
		await expect(helper.createOrUpdateData()).resolves.toStrictEqual(parsedAuthor)
	})

	test('returns original author if it was updated recently when trying to update', async () => {
		spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(true)
		helper.originalData = authorWithoutProjectionUpdatedNow
		await expect(helper.updateActions()).resolves.toStrictEqual(parsedAuthor)
	})

	test('isUpdatedRecently returns false if no originalAuthor is present', () => {
		expect(helper.isUpdatedRecently()).toBe(false)
	})

	test('run all update actions', async () => {
		helper.originalData = authorWithoutProjection
		await expect(helper.updateActions()).resolves.toStrictEqual(parsedAuthor)
	})

	test('run handler for a new author', async () => {
		mockPaprFindOne.mockResolvedValue({ data: null, modified: false })
		await expect(helper.handler()).resolves.toStrictEqual(parsedAuthor)
	})

	test('run handler and update an existing author', async () => {
		helper = new AuthorShowHelper(asin, { region: 'us', update: '1' }, null)
		mockPaprCreateOrUpdate.mockResolvedValue({ data: parsedAuthor, modified: true })
		mockPaprFindOne.mockResolvedValue({ data: authorWithoutProjection, modified: false })
		mockPaprFindOneWithProjection.mockResolvedValue({ data: parsedAuthor, modified: false })
		mockScrapeProcess.mockResolvedValue(parsedAuthor)
		spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(parsedAuthor)
		spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(false)
		await expect(helper.handler()).resolves.toStrictEqual(parsedAuthor)
	})

	test('run handler for an existing author in redis', async () => {
		ctx = createMockContext()
		helper = new AuthorShowHelper(asin, { region: 'us', update: '0' }, ctx.client)
		mockRedisFindOne.mockResolvedValue(parsedAuthor)
		await expect(helper.handler()).resolves.toStrictEqual(parsedAuthor)
		expect(helper.redisHelper.findOne).toHaveBeenCalledTimes(1)
	})

	test('run handler for an existing author', async () => {
		mockRedisFindOrCreate.mockResolvedValue(undefined)
		await expect(helper.handler()).resolves.toStrictEqual(parsedAuthor)
	})

	test('run handler for an existing author in redis', async () => {
		await expect(helper.handler()).resolves.toStrictEqual(parsedAuthor)
	})
})

describe('AuthorShowHelper should throw error when', () => {
	test('getDataWithProjection is not a author type', async () => {
		mockPaprFindOneWithProjection.mockResolvedValue({ data: null, modified: false })
		await expect(helper.getDataWithProjection()).rejects.toThrow(
			`Data type for ${asin} is not ApiAuthorProfile`
		)
	})

	test('getDataWithProjection sorted author is not a author type', async () => {
		setPerformanceConfig(createTestConfig({ USE_SORTED_KEYS: true }))
		spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(null as unknown as ApiAuthorProfile)
		await expect(helper.getDataWithProjection()).rejects.toThrow(
			`Data type for ${asin} is not ApiAuthorProfile`
		)
	})

	test('createOrUpdateAuthor is not a author type', async () => {
		mockPaprCreateOrUpdate.mockResolvedValue({ data: null, modified: false })
		await expect(helper.createOrUpdateData()).rejects.toThrow(
			`Data type for ${asin} is not ApiAuthorProfile`
		)
	})

	test('updateActions has no originalAuthor', async () => {
		helper.originalData = null
		await expect(helper.updateActions()).rejects.toThrow(
			`Missing original author data for ASIN: ${asin}`
		)
	})

	test('updateActions fails to update', async () => {
		helper.originalData = authorWithoutProjection
		mockPaprCreateOrUpdate.mockRejectedValue(new Error('error'))
		await expect(helper.updateActions()).rejects.toThrow('error')
	})
})

afterAll(() => {
	mock.restore()
})
