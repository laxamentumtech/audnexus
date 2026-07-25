import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'

const mockChapterFindOne = mock()
const mockChapterFind = mock()
const mockPaprFindOne = mock()
const mockPaprFindOneWithProjection = mock()
const mockPaprCreateOrUpdate = mock()
const mockRedisFindOne = mock()
const mockRedisFindOrCreate = mock()
const mockRedisSetOne = mock()
const mockRedisSetExpiration = mock()
const mockRedisDeleteOne = mock()
const mockSharedIsObject = mock()
const mockSharedSortObjectByKeys = mock()
const mockCheckersIsApiChapter = mock()
const mockChapterHelperProcess = mock()

mock.module('#config/models/Chapter', () => ({
	default: class ChapterModel {
		static findOne = mockChapterFindOne
		static find = mockChapterFind
	}
}))
mock.module('#helpers/database/papr/audible/PaprAudibleChapterHelper', () => ({
	default: class PaprAudibleChapterHelper {
		findOne = mockPaprFindOne
		findOneWithProjection = mockPaprFindOneWithProjection
		createOrUpdate = mockPaprCreateOrUpdate
		setData = mock()
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

mock.module('#helpers/utils/shared', () => ({
	isObject: mockSharedIsObject,
	sortObjectByKeys: mockSharedSortObjectByKeys
}))

mock.module('#config/typing/checkers', () => ({
	isApiChapter: mockCheckersIsApiChapter
}))

mock.module('#helpers/books/audible/ChapterHelper', () => ({
	default: class ChapterHelper {
		process = mockChapterHelperProcess
	}
}))

mock.module('@fastify/redis', () => ({}))

import type { FastifyRedis } from '@fastify/redis'

import {
	PerformanceConfig,
	resetPerformanceConfig,
	setPerformanceConfig
} from '#config/performance'
import { ApiChapter } from '#config/types'
import ChapterShowHelper from '#helpers/routes/ChapterShowHelper'
import {
	chaptersWithoutProjection,
	chaptersWithoutProjectionUpdatedNow,
	parsedChapters
} from '#tests/datasets/helpers/chapters'

type MockContext = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	client: any
}

let asin: string
let ctx: MockContext
let helper: ChapterShowHelper

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
	mock.clearAllMocks()
	asin = 'B079LRSMNN'
	helper = new ChapterShowHelper(asin, { region: 'us', update: undefined }, null)
	mockPaprCreateOrUpdate.mockResolvedValue({ data: parsedChapters, modified: true })
	mockPaprFindOne.mockResolvedValue({ data: chaptersWithoutProjection, modified: false })
	mockChapterHelperProcess.mockResolvedValue(parsedChapters)
	mockRedisFindOrCreate.mockResolvedValue(parsedChapters)
	mockPaprFindOneWithProjection.mockResolvedValue({ data: parsedChapters, modified: false })
	spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(parsedChapters)
	spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(false)
})

afterEach(() => {
	resetPerformanceConfig()
})

describe('ChapterShowHelper should', () => {
	test('get a chapter from Papr', async () => {
		await expect(helper.getDataFromPapr()).resolves.toStrictEqual(chaptersWithoutProjection)
	})

	test('get new chapter data', async () => {
		await expect(helper.getNewData()).resolves.toStrictEqual(parsedChapters)
	})

	test('create or update a chapter', async () => {
		await expect(helper.createOrUpdateData()).resolves.toStrictEqual(parsedChapters)
	})

	test('create or update chapter and return undefined if no chapters', async () => {
		mockChapterHelperProcess.mockResolvedValue(undefined)
		await expect(helper.createOrUpdateData()).resolves.toBeUndefined()
	})

	test('returns original chapter if it was updated recently when trying to update', async () => {
		spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(true)
		helper.originalData = chaptersWithoutProjectionUpdatedNow
		await expect(helper.updateActions()).resolves.toStrictEqual(parsedChapters)
	})

	test('isUpdatedRecently returns false if no originalData is present', () => {
		expect(helper.isUpdatedRecently()).toBe(false)
	})

	test('run all update actions', async () => {
		helper.originalData = chaptersWithoutProjection
		await expect(helper.updateActions()).resolves.toStrictEqual(parsedChapters)
	})

	test('run all update actions and return undefined if no chapters', async () => {
		mockChapterHelperProcess.mockResolvedValue(undefined)
		helper.originalData = chaptersWithoutProjection
		await expect(helper.updateActions()).resolves.toBeUndefined()
	})

	test('run handler for a new chapter', async () => {
		mockPaprFindOne.mockResolvedValue({ data: null, modified: false })
		await expect(helper.handler()).resolves.toStrictEqual(parsedChapters)
	})

	test('run handler and update an existing chapter', async () => {
		helper = new ChapterShowHelper(asin, { region: 'us', update: '1' }, null)
		mockPaprCreateOrUpdate.mockResolvedValue({ data: parsedChapters, modified: true })
		mockPaprFindOne.mockResolvedValue({ data: chaptersWithoutProjection, modified: false })
		mockPaprFindOneWithProjection.mockResolvedValue({ data: parsedChapters, modified: false })
		mockChapterHelperProcess.mockResolvedValue(parsedChapters)
		spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(parsedChapters)
		spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(false)
		await expect(helper.handler()).resolves.toStrictEqual(parsedChapters)
	})

	test('run handler for an existing chapter in redis', async () => {
		ctx = createMockContext()
		helper = new ChapterShowHelper(asin, { region: 'us', update: '0' }, ctx.client)
		mockRedisFindOne.mockResolvedValue(parsedChapters)
		await expect(helper.handler()).resolves.toStrictEqual(parsedChapters)
		expect(helper.redisHelper.findOne).toHaveBeenCalledTimes(1)
	})

	test('run handler for an existing chapter', async () => {
		mockRedisFindOrCreate.mockResolvedValue(undefined)
		await expect(helper.handler()).resolves.toStrictEqual(parsedChapters)
	})

	test('run handler for an existing chapter in redis', async () => {
		await expect(helper.handler()).resolves.toStrictEqual(parsedChapters)
	})

	test('run handler for no chapters', async () => {
		mockRedisFindOne.mockResolvedValue(null)
		mockPaprFindOne.mockResolvedValue({ data: null, modified: false })
		mockChapterHelperProcess.mockResolvedValue(undefined)
		await expect(helper.handler()).resolves.toBeUndefined()
	})
})

describe('ChapterShowHelper should throw error when', () => {
	test('getChaptersWithProjection is not a chapter type', async () => {
		mockPaprFindOneWithProjection.mockResolvedValue({ data: null, modified: false })
		await expect(helper.getDataWithProjection()).rejects.toThrow(
			`Data type for ${asin} is not ApiChapter`
		)
	})

	test('getChaptersWithProjection sorted chapters is not a chapter type', async () => {
		setPerformanceConfig(createTestConfig({ USE_SORTED_KEYS: true }))
		spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(null as unknown as ApiChapter)
		await expect(helper.getDataWithProjection()).rejects.toThrow(
			`Data type for ${asin} is not ApiChapter`
		)
	})

	test('createOrUpdateData is not a chapter type', async () => {
		mockPaprCreateOrUpdate.mockResolvedValue({ data: null, modified: false })
		await expect(helper.createOrUpdateData()).rejects.toThrow(
			`Data type for ${asin} is not ApiChapter`
		)
	})

	test('update has no originalData', async () => {
		helper.originalData = null
		await expect(helper.updateActions()).rejects.toThrow(
			`Missing original chapter data for ASIN: ${asin}`
		)
	})

	test('updateActions fails to update', async () => {
		mockPaprCreateOrUpdate.mockRejectedValue(new Error('Error'))
		helper.originalData = chaptersWithoutProjection
		await expect(helper.updateActions()).rejects.toThrow('Error')
	})
})

afterAll(() => {
	mock.restore()
})
