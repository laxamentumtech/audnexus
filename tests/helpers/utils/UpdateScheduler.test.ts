import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { ObjectId } from 'mongodb'

import { createMockLogger } from '#tests/setup/mockLogger'

const mockAuthorFind = mock()
const mockBookFind = mock()
const mockChapterFind = mock()

mock.module('#config/models/Author', () => ({
	default: { find: mockAuthorFind }
}))

mock.module('#config/models/Book', () => ({
	default: { find: mockBookFind }
}))

mock.module('#config/models/Chapter', () => ({
	default: { find: mockChapterFind }
}))

const mockAuthorHandler = mock()
const mockBookHandler = mock()
const mockChapterHandler = mock()

mock.module('#helpers/routes/AuthorShowHelper', () => ({
	default: class AuthorShowHelper {
		handler = mockAuthorHandler
	}
}))

mock.module('#helpers/routes/BookShowHelper', () => ({
	default: class BookShowHelper {
		handler = mockBookHandler
	}
}))

mock.module('#helpers/routes/ChapterShowHelper', () => ({
	default: class ChapterShowHelper {
		handler = mockChapterHandler
	}
}))

const mockProcessBatchByRegion = mock()
const mockProcessBatch = mock()

mock.module('#helpers/utils/batchProcessor', () => ({
	processBatchByRegion: mockProcessBatchByRegion,
	processBatch: mockProcessBatch
}))

import { AsyncTask, LongIntervalJob } from 'toad-scheduler'

import AuthorModel from '#config/models/Author'
import BookModel from '#config/models/Book'
import ChapterModel from '#config/models/Chapter'
import type { PerformanceConfig } from '#config/performance'
import { resetPerformanceConfig, setPerformanceConfig } from '#config/performance'
import { processBatchByRegion } from '#helpers/utils/batchProcessor'
import UpdateScheduler from '#helpers/utils/UpdateScheduler'
import { authorWithoutProjection } from '#tests/datasets/helpers/authors'
import { bookWithoutProjection } from '#tests/datasets/helpers/books'
import { chaptersWithoutProjection } from '#tests/datasets/helpers/chapters'

type MockContext = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	client: any
}

let ctx: MockContext
let helper: UpdateScheduler
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockLogger: any
const projection = {
	projection: { asin: 1, region: 1 },
	sort: { _id: 1 },
	limit: 1000
}

const createMockContext = (): MockContext => {
	return {
		client: {
			get: mock(),
			set: mock(),
			del: mock(),
			ping: mock(),
			expire: mock()
		}
	}
}

const createBatchSummary = (regions?: Record<string, number>) => ({
	total: 1,
	success: 1,
	failures: 0,
	regions: regions ?? { us: 1 },
	maxConcurrencyObserved: 1
})

const createProcessBatchByRegionMock =
	() =>
	async <T, R>(items: T[], worker: (item: T) => Promise<R>) => {
		const results: R[] = []
		for (const item of items) {
			try {
				const result = await worker(item)
				results.push(result)
			} catch {
				// intentionally empty - testing error handling
			}
		}
		return {
			results,
			summary: {
				total: items.length,
				success: 0,
				failures: items.length,
				regions: { us: items.length },
				maxConcurrencyObserved: 1
			}
		}
	}

const makePerformanceConfig = (useParallel: boolean): PerformanceConfig => ({
	USE_PARALLEL_SCHEDULER: useParallel,
	USE_CONNECTION_POOLING: true,
	USE_COMPACT_JSON: true,
	USE_SORTED_KEYS: false,
	CIRCUIT_BREAKER_ENABLED: true,
	METRICS_ENABLED: true,
	MAX_CONCURRENT_REQUESTS: 50,
	SCHEDULER_CONCURRENCY: 5,
	SCHEDULER_MAX_PER_REGION: 5,
	SCHEDULER_BATCH_SIZE: 1000,
	DEFAULT_REGION: 'us'
})

beforeEach(() => {
	ctx = createMockContext()
	mockLogger = createMockLogger()
	helper = new UpdateScheduler(1, ctx.client, mockLogger)
	resetPerformanceConfig()
	mockAuthorFind.mockClear()
	mockBookFind.mockClear()
	mockChapterFind.mockClear()
	mockAuthorHandler.mockClear()
	mockBookHandler.mockClear()
	mockChapterHandler.mockClear()
	mockProcessBatchByRegion.mockClear()
	mockProcessBatch.mockClear()
})

afterEach(() => {
	resetPerformanceConfig()
	mock.restore()
})

describe('UpdateScheduler should', () => {
	test('setup constructor', () => {
		expect(helper).toBeInstanceOf(UpdateScheduler)
		expect(helper.redis).toBe(ctx.client)
		expect(helper.interval).toBe(1)
	})

	test('paginates authors in _id-ordered batches', async () => {
		mockAuthorFind.mockResolvedValueOnce([authorWithoutProjection]).mockResolvedValueOnce([])
		await helper.updateAuthors()
		expect(AuthorModel.find).toHaveBeenNthCalledWith(1, {}, projection)
		expect(AuthorModel.find).toHaveBeenNthCalledWith(
			2,
			{ _id: { $gt: authorWithoutProjection._id } },
			projection
		)
	})

	test('paginates books in _id-ordered batches', async () => {
		mockBookFind.mockResolvedValueOnce([bookWithoutProjection]).mockResolvedValueOnce([])
		await helper.updateBooks()
		expect(BookModel.find).toHaveBeenNthCalledWith(1, {}, projection)
		expect(BookModel.find).toHaveBeenNthCalledWith(
			2,
			{ _id: { $gt: bookWithoutProjection._id } },
			projection
		)
	})

	test('paginates chapters in _id-ordered batches', async () => {
		mockChapterFind.mockResolvedValueOnce([chaptersWithoutProjection]).mockResolvedValueOnce([])
		await helper.updateChapters()
		expect(ChapterModel.find).toHaveBeenNthCalledWith(1, {}, projection)
		expect(ChapterModel.find).toHaveBeenNthCalledWith(
			2,
			{ _id: { $gt: chaptersWithoutProjection._id } },
			projection
		)
	})

	test('merges summaries across multiple pages', async () => {
		setPerformanceConfig(makePerformanceConfig(true))
		const secondPage = {
			...bookWithoutProjection,
			_id: new ObjectId('5c8f8f8f8f8f8f8f8f8f8f99')
		}
		mockBookFind
			.mockResolvedValueOnce([bookWithoutProjection])
			.mockResolvedValueOnce([secondPage])
			.mockResolvedValueOnce([])
		mockProcessBatchByRegion.mockImplementation(
			async <T, R>(items: T[], worker: (item: T) => Promise<R>) => {
				for (const item of items) {
					await worker(item)
				}
				return {
					results: [],
					summary: {
						total: items.length,
						success: items.length,
						failures: 0,
						regions: { us: items.length },
						maxConcurrencyObserved: 1
					}
				}
			}
		)
		mockBookHandler.mockResolvedValue(undefined)

		await helper.updateBooks()

		expect(BookModel.find).toHaveBeenNthCalledWith(
			3,
			{ _id: { $gt: secondPage._id } },
			projection
		)
		expect(mockLogger.debug).toHaveBeenCalledWith(
			'Books batch complete: total=2 success=2 failures=0'
		)
	})

	test('aggregates failures across multiple pages', async () => {
		setPerformanceConfig(makePerformanceConfig(true))
		const secondPage = {
			...bookWithoutProjection,
			_id: new ObjectId('5c8f8f8f8f8f8f8f8f8f8f98')
		}
		mockBookFind
			.mockResolvedValueOnce([bookWithoutProjection])
			.mockResolvedValueOnce([secondPage])
			.mockResolvedValueOnce([])
		mockProcessBatchByRegion.mockImplementation(
			async <T, R>(items: T[], worker: (item: T) => Promise<R>) => {
				for (const item of items) {
					await worker(item)
				}
				return {
					results: [],
					summary: {
						total: items.length,
						success: 0,
						failures: items.length,
						regions: { us: items.length },
						maxConcurrencyObserved: 1
					}
				}
			}
		)
		mockBookHandler.mockResolvedValue(undefined)

		await helper.updateBooks()

		expect(mockLogger.debug).toHaveBeenCalledWith(
			'Books batch complete: total=2 success=0 failures=2'
		)
	})

	test('updateAuthors', async () => {
		mockAuthorFind.mockResolvedValueOnce([authorWithoutProjection]).mockResolvedValueOnce([])
		mockAuthorHandler.mockResolvedValue(undefined)
		setPerformanceConfig(makePerformanceConfig(false))
		await expect(helper.updateAuthors()).resolves.toEqual(undefined)
		expect(AuthorModel.find).toHaveBeenCalledWith({}, projection)
		expect(mockAuthorHandler).toHaveBeenCalledWith()
	})

	test('updateBooks', async () => {
		mockBookFind.mockResolvedValueOnce([bookWithoutProjection]).mockResolvedValueOnce([])
		mockBookHandler.mockResolvedValue(undefined)
		setPerformanceConfig(makePerformanceConfig(false))
		await expect(helper.updateBooks()).resolves.toEqual(undefined)
		expect(BookModel.find).toHaveBeenCalledWith({}, projection)
		expect(mockBookHandler).toHaveBeenCalledWith()
	})

	test('updateChapters', async () => {
		mockChapterFind.mockResolvedValueOnce([chaptersWithoutProjection]).mockResolvedValueOnce([])
		mockChapterHandler.mockResolvedValue(undefined)
		setPerformanceConfig(makePerformanceConfig(false))
		await expect(helper.updateChapters()).resolves.toEqual(undefined)
		expect(ChapterModel.find).toHaveBeenCalledWith({}, projection)
		expect(mockChapterHandler).toHaveBeenCalledWith()
	})

	test('updateAll', async () => {
		const updateAuthorsSpy = spyOn(helper, 'updateAuthors').mockResolvedValue(undefined)
		const updateBooksSpy = spyOn(helper, 'updateBooks').mockResolvedValue(undefined)
		const updateChaptersSpy = spyOn(helper, 'updateChapters').mockResolvedValue(undefined)
		setPerformanceConfig(makePerformanceConfig(false))
		await expect(helper.updateAll()).resolves.toEqual(undefined)
		expect(updateAuthorsSpy).toHaveBeenCalledWith()
		expect(updateBooksSpy).toHaveBeenCalledWith()
		expect(updateChaptersSpy).toHaveBeenCalledWith()
	})

	test('updateAllTask', async () => {
		const updateAllSpy = spyOn(helper, 'updateAll').mockResolvedValue(undefined)
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
		updateAllSpy.mockRestore()
	})

	test('updateAllJob', async () => {
		const updateAllTaskSpy = spyOn(helper, 'updateAllTask').mockReturnValue(
			new AsyncTask('id_1', async () => undefined)
		)
		expect(JSON.stringify(helper.updateAllJob())).toEqual(
			JSON.stringify(
				new LongIntervalJob({ days: 1, runImmediately: true }, helper.updateAllTask(), {
					id: 'id_1',
					preventOverrun: true
				})
			)
		)
		updateAllTaskSpy.mockRestore()
	})

	test('updateAuthors with parallel processing when USE_PARALLEL_SCHEDULER is true', async () => {
		setPerformanceConfig(makePerformanceConfig(true))

		mockAuthorFind.mockResolvedValueOnce([authorWithoutProjection]).mockResolvedValueOnce([])
		mockProcessBatchByRegion.mockResolvedValue({
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
		setPerformanceConfig(makePerformanceConfig(true))

		mockBookFind.mockResolvedValueOnce([bookWithoutProjection]).mockResolvedValueOnce([])
		mockProcessBatchByRegion.mockResolvedValue({
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
		setPerformanceConfig(makePerformanceConfig(true))

		mockChapterFind.mockResolvedValueOnce([chaptersWithoutProjection]).mockResolvedValueOnce([])
		mockProcessBatchByRegion.mockResolvedValue({
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
		setPerformanceConfig(makePerformanceConfig(true))

		mockAuthorFind.mockResolvedValueOnce([authorWithoutProjection]).mockResolvedValueOnce([])
		mockAuthorHandler.mockRejectedValue(new Error('Test error'))
		mockProcessBatchByRegion.mockImplementation(createProcessBatchByRegionMock())

		await helper.updateAuthors()

		expect(processBatchByRegion).toHaveBeenCalled()
		expect(mockAuthorHandler).toHaveBeenCalled()
	})

	test('updateBooks with parallel processing handles errors gracefully', async () => {
		setPerformanceConfig(makePerformanceConfig(true))

		mockBookFind.mockResolvedValueOnce([bookWithoutProjection]).mockResolvedValueOnce([])
		mockBookHandler.mockRejectedValue(new Error('Test error'))
		mockProcessBatchByRegion.mockImplementation(createProcessBatchByRegionMock())

		await helper.updateBooks()

		expect(processBatchByRegion).toHaveBeenCalled()
		expect(mockBookHandler).toHaveBeenCalled()
	})

	test('updateChapters with parallel processing handles errors gracefully', async () => {
		setPerformanceConfig(makePerformanceConfig(true))

		mockChapterFind.mockResolvedValueOnce([chaptersWithoutProjection]).mockResolvedValueOnce([])
		mockChapterHandler.mockRejectedValue(new Error('Test error'))
		mockProcessBatchByRegion.mockImplementation(createProcessBatchByRegionMock())

		await helper.updateChapters()

		expect(processBatchByRegion).toHaveBeenCalled()
		expect(mockChapterHandler).toHaveBeenCalled()
	})

	test('updateAuthors uses sequential processing when USE_PARALLEL_SCHEDULER is false', async () => {
		setPerformanceConfig(makePerformanceConfig(false))

		mockAuthorFind.mockResolvedValueOnce([authorWithoutProjection]).mockResolvedValueOnce([])
		mockAuthorHandler.mockResolvedValue(undefined)

		await helper.updateAuthors()

		expect(AuthorModel.find).toHaveBeenCalledWith({}, projection)
		expect(processBatchByRegion).not.toHaveBeenCalled()
	})

	test('updateBooks uses sequential processing when USE_PARALLEL_SCHEDULER is false', async () => {
		setPerformanceConfig(makePerformanceConfig(false))

		mockBookFind.mockResolvedValueOnce([bookWithoutProjection]).mockResolvedValueOnce([])
		mockBookHandler.mockResolvedValue(undefined)

		await helper.updateBooks()

		expect(BookModel.find).toHaveBeenCalledWith({}, projection)
		expect(processBatchByRegion).not.toHaveBeenCalled()
	})

	test('updateChapters uses sequential processing when USE_PARALLEL_SCHEDULER is false', async () => {
		setPerformanceConfig(makePerformanceConfig(false))

		mockChapterFind.mockResolvedValueOnce([chaptersWithoutProjection]).mockResolvedValueOnce([])
		mockChapterHandler.mockResolvedValue(undefined)

		await helper.updateChapters()

		expect(ChapterModel.find).toHaveBeenCalledWith({}, projection)
		expect(processBatchByRegion).not.toHaveBeenCalled()
	})

	test('updateAuthors logs warning when maxConcurrencyObserved exceeds configured concurrency', async () => {
		setPerformanceConfig(makePerformanceConfig(true))

		mockAuthorFind.mockResolvedValueOnce([authorWithoutProjection]).mockResolvedValueOnce([])
		mockProcessBatchByRegion.mockResolvedValue({
			results: [undefined],
			summary: {
				total: 1,
				success: 1,
				failures: 0,
				regions: { us: 1 },
				maxConcurrencyObserved: 10
			}
		})

		await helper.updateAuthors()

		expect(AuthorModel.find).toHaveBeenCalledWith({}, projection)
		expect(processBatchByRegion).toHaveBeenCalled()
		expect(mockLogger.warn).toHaveBeenCalledWith(
			'Authors batch exceeded configured concurrency (10/5)'
		)
	})
})

afterAll(() => {
	mock.restore()
})
