jest.mock('#config/models/Author')
jest.mock('#helpers/database/papr/audible/PaprAudibleAuthorHelper')
jest.mock('#helpers/authors/audible/ScrapeHelper')
jest.mock('#helpers/database/redis/RedisHelper')
jest.mock('@fastify/redis')

import type { FastifyRedis } from '@fastify/redis'
import { DeepMockProxy, mockDeep } from 'jest-mock-extended'

import {
	PerformanceConfig,
	resetPerformanceConfig,
	setPerformanceConfig
} from '#config/performance'
import { ApiAuthorProfile } from '#config/types'
import ScrapeHelper from '#helpers/authors/audible/ScrapeHelper'
import PaprAudibleAuthorHelper from '#helpers/database/papr/audible/PaprAudibleAuthorHelper'
import AuthorShowHelper from '#helpers/routes/AuthorShowHelper'
import {
	authorWithoutProjection,
	authorWithoutProjectionUpdatedNow,
	parsedAuthor
} from '#tests/datasets/helpers/authors'

/**
 * Factory function for creating test PerformanceConfig instances.
 * Provides a reusable base configuration with optional overrides.
 */
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
	client: DeepMockProxy<FastifyRedis>
}

let asin: string
let ctx: MockContext
let helper: AuthorShowHelper

const createMockContext = (): MockContext => {
	return {
		client: mockDeep<FastifyRedis>()
	}
}

beforeEach(() => {
	asin = 'B079LRSMNN'
	helper = new AuthorShowHelper(asin, { region: 'us', update: undefined }, null)
	jest
		.spyOn(helper.paprHelper, 'createOrUpdate')
		.mockResolvedValue({ data: parsedAuthor, modified: true })
	jest
		.spyOn(helper.paprHelper, 'findOne')
		.mockResolvedValue({ data: authorWithoutProjection, modified: false })
	jest.spyOn(ScrapeHelper.prototype, 'process').mockResolvedValue(parsedAuthor)
	jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(parsedAuthor)
	jest
		.spyOn(helper.paprHelper, 'findOneWithProjection')
		.mockResolvedValue({ data: parsedAuthor, modified: false })
	jest.spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(parsedAuthor)
	jest.spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(false)
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
		jest.spyOn(PaprAudibleAuthorHelper.prototype, 'findByName').mockResolvedValue(obj)
		await expect(helper.getAuthorsByName()).resolves.toStrictEqual(authors)
	})

	test('get new author data', async () => {
		await expect(helper.getNewData()).resolves.toStrictEqual(parsedAuthor)
	})

	test('create or update a author', async () => {
		await expect(helper.createOrUpdateData()).resolves.toStrictEqual(parsedAuthor)
	})

	test('returns original author if it was updated recently when trying to update', async () => {
		jest.spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(true)
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
		jest.spyOn(helper.paprHelper, 'findOne').mockResolvedValue({ data: null, modified: false })
		await expect(helper.handler()).resolves.toStrictEqual(parsedAuthor)
	})

	test('run handler and update an existing author', async () => {
		helper = new AuthorShowHelper(asin, { region: 'us', update: '1' }, null)
		// Need to re-do mock since helper reset
		jest
			.spyOn(helper.paprHelper, 'createOrUpdate')
			.mockResolvedValue({ data: parsedAuthor, modified: true })
		jest
			.spyOn(helper.paprHelper, 'findOne')
			.mockResolvedValue({ data: authorWithoutProjection, modified: false })
		jest
			.spyOn(helper.paprHelper, 'findOneWithProjection')
			.mockResolvedValue({ data: parsedAuthor, modified: false })
		jest.spyOn(ScrapeHelper.prototype, 'process').mockResolvedValue(parsedAuthor)
		jest.spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(parsedAuthor)
		jest.spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(false)
		await expect(helper.handler()).resolves.toStrictEqual(parsedAuthor)
	})

	test('run handler for an existing author in redis', async () => {
		ctx = createMockContext()
		helper = new AuthorShowHelper(asin, { region: 'us', update: '0' }, ctx.client)
		// Need to re-do mock since helper reset
		jest.spyOn(helper.redisHelper, 'findOne').mockResolvedValue(parsedAuthor)
		await expect(helper.handler()).resolves.toStrictEqual(parsedAuthor)
		expect(helper.redisHelper.findOne).toHaveBeenCalledTimes(1)
	})

	test('run handler for an existing author', async () => {
		jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(undefined)
		await expect(helper.handler()).resolves.toStrictEqual(parsedAuthor)
	})

	test('run handler for an existing author in redis', async () => {
		await expect(helper.handler()).resolves.toStrictEqual(parsedAuthor)
	})
})

describe('AuthorShowHelper should throw error when', () => {
	test('getDataWithProjection is not a author type', async () => {
		jest
			.spyOn(helper.paprHelper, 'findOneWithProjection')
			.mockResolvedValue({ data: null, modified: false })
		await expect(helper.getDataWithProjection()).rejects.toThrow(
			`Data type for ${asin} is not ApiAuthorProfile`
		)
	})

	test('getDataWithProjection sorted author is not a author type', async () => {
		// Enable USE_SORTED_KEYS to test sorting error handling
		setPerformanceConfig(createTestConfig({ USE_SORTED_KEYS: true }))
		jest
			.spyOn(helper.sharedHelper, 'sortObjectByKeys')
			.mockReturnValue(null as unknown as ApiAuthorProfile)
		await expect(helper.getDataWithProjection()).rejects.toThrow(
			`Data type for ${asin} is not ApiAuthorProfile`
		)
	})

	test('createOrUpdateAuthor is not a author type', async () => {
		jest
			.spyOn(helper.paprHelper, 'createOrUpdate')
			.mockResolvedValue({ data: null, modified: false })
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
		jest.spyOn(helper.paprHelper, 'createOrUpdate').mockRejectedValue(new Error('error'))
		await expect(helper.updateActions()).rejects.toThrow('error')
	})
})
