jest.mock('@fastify/redis')
jest.mock('#config/models/Author')
jest.mock('#config/models/Book')
jest.mock('#config/models/Chapter')
jest.mock('#helpers/routes/AuthorShowHelper')
jest.mock('#helpers/routes/BookShowHelper')
jest.mock('#helpers/routes/ChapterShowHelper')
jest.mock('#helpers/utils/batchProcessor')
import type { FastifyRedis } from '@fastify/redis'
import type { FastifyBaseLogger } from 'fastify'
import { DeepMockProxy, mockDeep } from 'jest-mock-extended'
import { AsyncTask, LongIntervalJob } from 'toad-scheduler'

import AuthorModel from '#config/models/Author'
import BookModel from '#config/models/Book'
import ChapterModel from '#config/models/Chapter'
import { resetPerformanceConfig, setPerformanceConfig } from '#config/performance'
import AuthorShowHelper from '#helpers/routes/AuthorShowHelper'
import BookShowHelper from '#helpers/routes/BookShowHelper'
import ChapterShowHelper from '#helpers/routes/ChapterShowHelper'
import { processBatchByRegion } from '#helpers/utils/batchProcessor'
import UpdateScheduler from '#helpers/utils/UpdateScheduler'
import { authorWithoutProjection } from '#tests/datasets/helpers/authors'
import { bookWithoutProjection } from '#tests/datasets/helpers/books'
import { chaptersWithoutProjection } from '#tests/datasets/helpers/chapters'

type MockContext = {
	client: DeepMockProxy<FastifyRedis>
}

let ctx: MockContext
let helper: UpdateScheduler
const projection = {
	projection: { asin: 1, region: 1 },
	sort: { updatedAt: -1 },
	allowDiskUse: true
}

const createMockContext = (): MockContext => {
	return {
		client: mockDeep<FastifyRedis>()
	}
}

const createBatchSummary = (regions?: Record<string, number>) => ({
	total: 1,
	success: 1,
	failures: 0,
	regions: regions ?? { us: 1 },
	maxConcurrencyObserved: 1
})

beforeEach(() => {
	ctx = createMockContext()
	const mockLogger = mockDeep<FastifyBaseLogger>()
	helper = new UpdateScheduler(1, ctx.client, mockLogger)
	resetPerformanceConfig()
})

afterEach(() => {
	resetPerformanceConfig()
})

describe('UpdateScheduler should', () => {
	test('setup constructor', () => {
		expect(helper).toBeInstanceOf(UpdateScheduler)
		expect(helper.redis).toBe(ctx.client)
		expect(helper.interval).toBe(1)
	})

	test('getAllAuthorAsins', async () => {
		jest.spyOn(AuthorModel, 'find').mockResolvedValue([authorWithoutProjection])
		await expect(helper.getAllAuthorAsins()).resolves.toEqual([authorWithoutProjection])
		expect(AuthorModel.find).toHaveBeenCalledWith({}, projection)
	})

	test('getAllBookAsins', async () => {
		jest.spyOn(BookModel, 'find').mockResolvedValue([bookWithoutProjection])
		await expect(helper.getAllBookAsins()).resolves.toEqual([bookWithoutProjection])
		expect(BookModel.find).toHaveBeenCalledWith({}, projection)
	})

	test('getAllChapterAsins', async () => {
		jest.spyOn(ChapterModel, 'find').mockResolvedValue([chaptersWithoutProjection])
		await expect(helper.getAllChapterAsins()).resolves.toEqual([chaptersWithoutProjection])
		expect(ChapterModel.find).toHaveBeenCalledWith({}, projection)
	})

	test('updateAuthors', async () => {
		jest.spyOn(AuthorModel, 'find').mockResolvedValue([authorWithoutProjection])
		jest.spyOn(AuthorShowHelper.prototype, 'handler').mockResolvedValue(undefined)
		setPerformanceConfig({
			USE_PARALLEL_SCHEDULER: false,
			USE_CONNECTION_POOLING: true,
			USE_COMPACT_JSON: true,
			USE_SORTED_KEYS: false,
			CIRCUIT_BREAKER_ENABLED: true,
			METRICS_ENABLED: true,
			MAX_CONCURRENT_REQUESTS: 50,
			SCHEDULER_CONCURRENCY: 5
		})
		await expect(helper.updateAuthors()).resolves.toEqual(undefined)
		expect(AuthorModel.find).toHaveBeenCalledWith({}, projection)
		expect(AuthorShowHelper.prototype.handler).toHaveBeenCalledWith()
	})

	test('updateBooks', async () => {
		jest.spyOn(BookModel, 'find').mockResolvedValue([bookWithoutProjection])
		jest.spyOn(BookShowHelper.prototype, 'handler').mockResolvedValue(undefined)
		setPerformanceConfig({
			USE_PARALLEL_SCHEDULER: false,
			USE_CONNECTION_POOLING: true,
			USE_COMPACT_JSON: true,
			USE_SORTED_KEYS: false,
			CIRCUIT_BREAKER_ENABLED: true,
			METRICS_ENABLED: true,
			MAX_CONCURRENT_REQUESTS: 50,
			SCHEDULER_CONCURRENCY: 5
		})
		await expect(helper.updateBooks()).resolves.toEqual(undefined)
		expect(BookModel.find).toHaveBeenCalledWith({}, projection)
		expect(BookShowHelper.prototype.handler).toHaveBeenCalledWith()
	})

	test('updateChapters', async () => {
		jest.spyOn(ChapterModel, 'find').mockResolvedValue([chaptersWithoutProjection])
		jest.spyOn(ChapterShowHelper.prototype, 'handler').mockResolvedValue(undefined)
		setPerformanceConfig({
			USE_PARALLEL_SCHEDULER: false,
			USE_CONNECTION_POOLING: true,
			USE_COMPACT_JSON: true,
			USE_SORTED_KEYS: false,
			CIRCUIT_BREAKER_ENABLED: true,
			METRICS_ENABLED: true,
			MAX_CONCURRENT_REQUESTS: 50,
			SCHEDULER_CONCURRENCY: 5
		})
		await expect(helper.updateChapters()).resolves.toEqual(undefined)
		expect(ChapterModel.find).toHaveBeenCalledWith({}, projection)
		expect(ChapterShowHelper.prototype.handler).toHaveBeenCalledWith()
	})

	test('updateAll', async () => {
		jest.spyOn(helper, 'updateAuthors').mockResolvedValue(undefined)
		jest.spyOn(helper, 'updateBooks').mockResolvedValue(undefined)
		jest.spyOn(helper, 'updateChapters').mockResolvedValue(undefined)
		setPerformanceConfig({
			USE_PARALLEL_SCHEDULER: false,
			USE_CONNECTION_POOLING: true,
			USE_COMPACT_JSON: true,
			USE_SORTED_KEYS: false,
			CIRCUIT_BREAKER_ENABLED: true,
			METRICS_ENABLED: true,
			MAX_CONCURRENT_REQUESTS: 50,
			SCHEDULER_CONCURRENCY: 5
		})
		await expect(helper.updateAll()).resolves.toEqual(undefined)
		expect(helper.updateAuthors).toHaveBeenCalledWith()
		expect(helper.updateBooks).toHaveBeenCalledWith()
		expect(helper.updateChapters).toHaveBeenCalledWith()
	})

	test('updateAllTask', async () => {
		jest.spyOn(helper, 'updateAll').mockResolvedValue(undefined)
		expect(JSON.stringify(helper.updateAllTask())).toEqual(
			JSON.stringify(
				new AsyncTask(
					'updateAll',
					() => {
						return helper.updateAll().then((res) => res)
					},
					(err) => {
						console.error(err)
					}
				)
			)
		)
	})

	test('updateAllJob', async () => {
		jest
			.spyOn(helper, 'updateAllTask')
			.mockReturnValue(new AsyncTask('id_1', async () => undefined))
		expect(JSON.stringify(helper.updateAllJob())).toEqual(
			JSON.stringify(
				new LongIntervalJob({ days: 1, runImmediately: true }, helper.updateAllTask(), {
					id: 'id_1',
					preventOverrun: true
				})
			)
		)
	})

	// Parallel scheduler tests
	test('updateAuthors with parallel processing when USE_PARALLEL_SCHEDULER is true', async () => {
		setPerformanceConfig({
			USE_PARALLEL_SCHEDULER: true,
			USE_CONNECTION_POOLING: true,
			USE_COMPACT_JSON: true,
			USE_SORTED_KEYS: false,
			CIRCUIT_BREAKER_ENABLED: true,
			METRICS_ENABLED: true,
			MAX_CONCURRENT_REQUESTS: 50,
			SCHEDULER_CONCURRENCY: 5
		})

		jest.spyOn(AuthorModel, 'find').mockResolvedValue([authorWithoutProjection])
		;(processBatchByRegion as jest.Mock).mockResolvedValue({
			results: [undefined],
			summary: createBatchSummary()
		})

		await helper.updateAuthors()

		expect(AuthorModel.find).toHaveBeenCalledWith({}, projection)
		expect(processBatchByRegion).toHaveBeenCalledWith(
			[authorWithoutProjection],
			expect.any(Function),
			{ concurrency: 5, maxPerRegion: 5 }
		)
	})

	test('updateBooks with parallel processing when USE_PARALLEL_SCHEDULER is true', async () => {
		setPerformanceConfig({
			USE_PARALLEL_SCHEDULER: true,
			USE_CONNECTION_POOLING: true,
			USE_COMPACT_JSON: true,
			USE_SORTED_KEYS: false,
			CIRCUIT_BREAKER_ENABLED: true,
			METRICS_ENABLED: true,
			MAX_CONCURRENT_REQUESTS: 50,
			SCHEDULER_CONCURRENCY: 5
		})

		jest.spyOn(BookModel, 'find').mockResolvedValue([bookWithoutProjection])
		;(processBatchByRegion as jest.Mock).mockResolvedValue({
			results: [undefined],
			summary: createBatchSummary()
		})

		await helper.updateBooks()

		expect(BookModel.find).toHaveBeenCalledWith({}, projection)
		expect(processBatchByRegion).toHaveBeenCalledWith(
			[bookWithoutProjection],
			expect.any(Function),
			{ concurrency: 5, maxPerRegion: 5 }
		)
	})

	test('updateChapters with parallel processing when USE_PARALLEL_SCHEDULER is true', async () => {
		setPerformanceConfig({
			USE_PARALLEL_SCHEDULER: true,
			USE_CONNECTION_POOLING: true,
			USE_COMPACT_JSON: true,
			USE_SORTED_KEYS: false,
			CIRCUIT_BREAKER_ENABLED: true,
			METRICS_ENABLED: true,
			MAX_CONCURRENT_REQUESTS: 50,
			SCHEDULER_CONCURRENCY: 5
		})

		jest.spyOn(ChapterModel, 'find').mockResolvedValue([chaptersWithoutProjection])
		;(processBatchByRegion as jest.Mock).mockResolvedValue({
			results: [undefined],
			summary: createBatchSummary()
		})

		await helper.updateChapters()

		expect(ChapterModel.find).toHaveBeenCalledWith({}, projection)
		expect(processBatchByRegion).toHaveBeenCalledWith(
			[chaptersWithoutProjection],
			expect.any(Function),
			{ concurrency: 5, maxPerRegion: 5 }
		)
	})

	test('updateAuthors with parallel processing handles errors gracefully', async () => {
		setPerformanceConfig({
			USE_PARALLEL_SCHEDULER: true,
			USE_CONNECTION_POOLING: true,
			USE_COMPACT_JSON: true,
			USE_SORTED_KEYS: false,
			CIRCUIT_BREAKER_ENABLED: true,
			METRICS_ENABLED: true,
			MAX_CONCURRENT_REQUESTS: 50,
			SCHEDULER_CONCURRENCY: 5
		})

		jest.spyOn(AuthorModel, 'find').mockResolvedValue([authorWithoutProjection])
		;(processBatchByRegion as jest.Mock).mockResolvedValue({
			results: [undefined],
			summary: createBatchSummary()
		})
		jest.spyOn(AuthorShowHelper.prototype, 'handler').mockRejectedValue(new Error('Test error'))

		await helper.updateAuthors()

		expect(processBatchByRegion).toHaveBeenCalled()
	})

	test('updateBooks with parallel processing handles errors gracefully', async () => {
		setPerformanceConfig({
			USE_PARALLEL_SCHEDULER: true,
			USE_CONNECTION_POOLING: true,
			USE_COMPACT_JSON: true,
			USE_SORTED_KEYS: false,
			CIRCUIT_BREAKER_ENABLED: true,
			METRICS_ENABLED: true,
			MAX_CONCURRENT_REQUESTS: 50,
			SCHEDULER_CONCURRENCY: 5
		})

		jest.spyOn(BookModel, 'find').mockResolvedValue([bookWithoutProjection])
		;(processBatchByRegion as jest.Mock).mockResolvedValue({
			results: [undefined],
			summary: createBatchSummary()
		})
		jest.spyOn(BookShowHelper.prototype, 'handler').mockRejectedValue(new Error('Test error'))

		await helper.updateBooks()

		expect(processBatchByRegion).toHaveBeenCalled()
	})

	test('updateChapters with parallel processing handles errors gracefully', async () => {
		setPerformanceConfig({
			USE_PARALLEL_SCHEDULER: true,
			USE_CONNECTION_POOLING: true,
			USE_COMPACT_JSON: true,
			USE_SORTED_KEYS: false,
			CIRCUIT_BREAKER_ENABLED: true,
			METRICS_ENABLED: true,
			MAX_CONCURRENT_REQUESTS: 50,
			SCHEDULER_CONCURRENCY: 5
		})

		jest.spyOn(ChapterModel, 'find').mockResolvedValue([chaptersWithoutProjection])
		;(processBatchByRegion as jest.Mock).mockResolvedValue({
			results: [undefined],
			summary: createBatchSummary()
		})
		jest.spyOn(ChapterShowHelper.prototype, 'handler').mockRejectedValue(new Error('Test error'))

		await helper.updateChapters()

		expect(processBatchByRegion).toHaveBeenCalled()
	})

	test('updateAuthors uses sequential processing when USE_PARALLEL_SCHEDULER is false', async () => {
		setPerformanceConfig({
			USE_PARALLEL_SCHEDULER: false,
			USE_CONNECTION_POOLING: true,
			USE_COMPACT_JSON: true,
			USE_SORTED_KEYS: false,
			CIRCUIT_BREAKER_ENABLED: true,
			METRICS_ENABLED: true,
			MAX_CONCURRENT_REQUESTS: 50,
			SCHEDULER_CONCURRENCY: 5
		})

		jest.spyOn(AuthorModel, 'find').mockResolvedValue([authorWithoutProjection])
		jest.spyOn(AuthorShowHelper.prototype, 'handler').mockResolvedValue(undefined)

		await helper.updateAuthors()

		expect(AuthorModel.find).toHaveBeenCalledWith({}, projection)
		expect(processBatchByRegion).not.toHaveBeenCalled()
	})

	test('updateBooks uses sequential processing when USE_PARALLEL_SCHEDULER is false', async () => {
		setPerformanceConfig({
			USE_PARALLEL_SCHEDULER: false,
			USE_CONNECTION_POOLING: true,
			USE_COMPACT_JSON: true,
			USE_SORTED_KEYS: false,
			CIRCUIT_BREAKER_ENABLED: true,
			METRICS_ENABLED: true,
			MAX_CONCURRENT_REQUESTS: 50,
			SCHEDULER_CONCURRENCY: 5
		})

		jest.spyOn(BookModel, 'find').mockResolvedValue([bookWithoutProjection])
		jest.spyOn(BookShowHelper.prototype, 'handler').mockResolvedValue(undefined)

		await helper.updateBooks()

		expect(BookModel.find).toHaveBeenCalledWith({}, projection)
		expect(processBatchByRegion).not.toHaveBeenCalled()
	})

	test('updateChapters uses sequential processing when USE_PARALLEL_SCHEDULER is false', async () => {
		setPerformanceConfig({
			USE_PARALLEL_SCHEDULER: false,
			USE_CONNECTION_POOLING: true,
			USE_COMPACT_JSON: true,
			USE_SORTED_KEYS: false,
			CIRCUIT_BREAKER_ENABLED: true,
			METRICS_ENABLED: true,
			MAX_CONCURRENT_REQUESTS: 50,
			SCHEDULER_CONCURRENCY: 5
		})

		jest.spyOn(ChapterModel, 'find').mockResolvedValue([chaptersWithoutProjection])
		jest.spyOn(ChapterShowHelper.prototype, 'handler').mockResolvedValue(undefined)

		await helper.updateChapters()

		expect(ChapterModel.find).toHaveBeenCalledWith({}, projection)
		expect(processBatchByRegion).not.toHaveBeenCalled()
	})
})
