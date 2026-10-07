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
// Fresh-fetch signal (GenericShowHelper.fetchedFreshData): the scheduler
// only registers a usable success (cooldown decay) when the handler
// actually fetched — stored-data returns must not relax the cooldown.
const authorFreshData = { fetched: true }
const bookFreshData = { fetched: true }
const chapterFreshData = { fetched: true }

mock.module('#helpers/routes/AuthorShowHelper', () => ({
	default: class AuthorShowHelper {
		handler = mockAuthorHandler
		fetchedFreshData = authorFreshData.fetched
	}
}))

mock.module('#helpers/routes/BookShowHelper', () => ({
	default: class BookShowHelper {
		handler = mockBookHandler
		fetchedFreshData = bookFreshData.fetched
	}
}))

mock.module('#helpers/routes/ChapterShowHelper', () => ({
	default: class ChapterShowHelper {
		handler = mockChapterHandler
		fetchedFreshData = chapterFreshData.fetched
	}
}))

const mockProcessBatchByRegion = mock()

mock.module('#helpers/utils/batchProcessor', () => ({
	processBatchByRegion: mockProcessBatchByRegion
}))

// Cooldown is process-global and sleeps real time; stub it so scheduler
// tests assert call order without waiting (see adaptiveCooldown tests for
// the real state machine).
const mockSleepCooldown = mock()
const mockRegisterSuccess = mock()

mock.module('#helpers/utils/adaptiveCooldown', () => ({
	sleepCooldown: mockSleepCooldown,
	registerSuccess: mockRegisterSuccess
}))

import AuthorModel from '#config/models/Author'
import BookModel from '#config/models/Book'
import ChapterModel from '#config/models/Chapter'
import { resetPerformanceConfig, setPerformanceConfig } from '#config/performance'
import { processBatchByRegion } from '#helpers/utils/batchProcessor'
import UpdateScheduler from '#helpers/utils/UpdateScheduler'
import { authorWithoutProjection } from '#tests/datasets/helpers/authors'
import { bookWithoutProjection } from '#tests/datasets/helpers/books'
import { chaptersWithoutProjection } from '#tests/datasets/helpers/chapters'
import { createTestPerformanceConfig } from '#tests/setup/performanceConfig'

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

beforeEach(() => {
	ctx = createMockContext()
	mockLogger = createMockLogger()
	helper = new UpdateScheduler(ctx.client, mockLogger)
	resetPerformanceConfig()
	mockAuthorFind.mockClear()
	mockBookFind.mockClear()
	mockChapterFind.mockClear()
	mockAuthorHandler.mockClear()
	mockBookHandler.mockClear()
	mockChapterHandler.mockClear()
	mockProcessBatchByRegion.mockClear()
	mockSleepCooldown.mockClear()
	mockSleepCooldown.mockResolvedValue(undefined)
	mockRegisterSuccess.mockClear()
	// Default: the handler fetched fresh data (the usable-success signal).
	authorFreshData.fetched = true
	bookFreshData.fetched = true
	chapterFreshData.fetched = true
})

afterEach(() => {
	resetPerformanceConfig()
	mock.restore()
})

describe('UpdateScheduler should', () => {
	test('setup constructor', () => {
		expect(helper).toBeInstanceOf(UpdateScheduler)
		expect(helper.redis).toBe(ctx.client)
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
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: true }))
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

		expect(BookModel.find).toHaveBeenNthCalledWith(3, { _id: { $gt: secondPage._id } }, projection)
		expect(mockLogger.debug).toHaveBeenCalledWith(
			'Books batch complete: total=2 success=2 failures=0'
		)
	})

	test('aggregates failures across multiple pages', async () => {
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: true }))
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
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: false }))
		await expect(helper.updateAuthors()).resolves.toEqual(undefined)
		expect(AuthorModel.find).toHaveBeenCalledWith({}, projection)
		expect(mockAuthorHandler).toHaveBeenCalledWith()
	})

	test('updateBooks', async () => {
		mockBookFind.mockResolvedValueOnce([bookWithoutProjection]).mockResolvedValueOnce([])
		mockBookHandler.mockResolvedValue(undefined)
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: false }))
		await expect(helper.updateBooks()).resolves.toEqual(undefined)
		expect(BookModel.find).toHaveBeenCalledWith({}, projection)
		expect(mockBookHandler).toHaveBeenCalledWith()
	})

	test('updateChapters', async () => {
		mockChapterFind.mockResolvedValueOnce([chaptersWithoutProjection]).mockResolvedValueOnce([])
		mockChapterHandler.mockResolvedValue(undefined)
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: false }))
		await expect(helper.updateChapters()).resolves.toEqual(undefined)
		expect(ChapterModel.find).toHaveBeenCalledWith({}, projection)
		expect(mockChapterHandler).toHaveBeenCalledWith()
	})

	test('updateAll', async () => {
		const emptySummary = {
			total: 0,
			success: 0,
			failures: 0,
			regions: {},
			maxConcurrencyObserved: 0
		}
		const updateAuthorsSpy = spyOn(helper, 'updateAuthors').mockResolvedValue(undefined)
		const updateBooksSpy = spyOn(helper, 'updateBooks').mockResolvedValue(undefined)
		const updateChaptersSpy = spyOn(helper, 'updateChapters').mockResolvedValue(undefined)
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: false }))
		await expect(helper.updateAll()).resolves.toEqual(emptySummary)
		expect(updateAuthorsSpy).toHaveBeenCalledWith(emptySummary)
		expect(updateBooksSpy).toHaveBeenCalledWith(emptySummary)
		expect(updateChaptersSpy).toHaveBeenCalledWith(emptySummary)
	})

	test('updateAuthors with parallel processing when USE_PARALLEL_SCHEDULER is true', async () => {
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: true }))

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
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: true }))

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
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: true }))

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
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: true }))

		mockAuthorFind.mockResolvedValueOnce([authorWithoutProjection]).mockResolvedValueOnce([])
		mockAuthorHandler.mockRejectedValue(new Error('Test error'))
		mockProcessBatchByRegion.mockImplementation(createProcessBatchByRegionMock())

		await helper.updateAuthors()

		expect(processBatchByRegion).toHaveBeenCalled()
		expect(mockAuthorHandler).toHaveBeenCalled()
	})

	test('updateBooks with parallel processing handles errors gracefully', async () => {
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: true }))

		mockBookFind.mockResolvedValueOnce([bookWithoutProjection]).mockResolvedValueOnce([])
		mockBookHandler.mockRejectedValue(new Error('Test error'))
		mockProcessBatchByRegion.mockImplementation(createProcessBatchByRegionMock())

		await helper.updateBooks()

		expect(processBatchByRegion).toHaveBeenCalled()
		expect(mockBookHandler).toHaveBeenCalled()
	})

	test('updateChapters with parallel processing handles errors gracefully', async () => {
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: true }))

		mockChapterFind.mockResolvedValueOnce([chaptersWithoutProjection]).mockResolvedValueOnce([])
		mockChapterHandler.mockRejectedValue(new Error('Test error'))
		mockProcessBatchByRegion.mockImplementation(createProcessBatchByRegionMock())

		await helper.updateChapters()

		expect(processBatchByRegion).toHaveBeenCalled()
		expect(mockChapterHandler).toHaveBeenCalled()
	})

	test('updateAuthors accumulates summary across successes and failures in sequential processing', async () => {
		setPerformanceConfig(
			createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: false, JITTER_MS: { min: 0, max: 0 } })
		)

		const usA = { ...authorWithoutProjection, asin: 'B000000001', region: 'us' }
		const usB = { ...authorWithoutProjection, asin: 'B000000002', region: 'us' }
		const regionless = { ...authorWithoutProjection, asin: 'B000000003', region: undefined }
		mockAuthorFind.mockResolvedValueOnce([usA, usB, regionless]).mockResolvedValueOnce([])
		// Sequential processing invokes the handler in document order; the third
		// (region-less) doc's call rejects to exercise the failure branch.
		mockAuthorHandler
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error('Test error'))

		await helper.updateAuthors()

		expect(AuthorModel.find).toHaveBeenCalledWith({}, projection)
		expect(mockProcessBatchByRegion).not.toHaveBeenCalled()
		expect(mockAuthorHandler).toHaveBeenCalledTimes(3)
		expect(mockLogger.error).toHaveBeenCalledTimes(1)
		expect(mockLogger.debug).toHaveBeenCalledWith(
			'Authors batch complete: total=3 success=2 failures=1'
		)
		// normalizeRegion leaves 'us' as-is and maps a missing region to DEFAULT_REGION ('us'),
		// so all three docs land under the 'us' bucket.
		expect(mockLogger.debug).toHaveBeenCalledWith('Authors batch regions: 1 maxConcurrency=0')
	})

	test('updateAuthors uses sequential processing when USE_PARALLEL_SCHEDULER is false', async () => {
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: false }))

		mockAuthorFind.mockResolvedValueOnce([authorWithoutProjection]).mockResolvedValueOnce([])
		mockAuthorHandler.mockResolvedValue(undefined)

		await helper.updateAuthors()

		expect(AuthorModel.find).toHaveBeenCalledWith({}, projection)
		expect(processBatchByRegion).not.toHaveBeenCalled()
	})

	test('updateBooks uses sequential processing when USE_PARALLEL_SCHEDULER is false', async () => {
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: false }))

		mockBookFind.mockResolvedValueOnce([bookWithoutProjection]).mockResolvedValueOnce([])
		mockBookHandler.mockResolvedValue(undefined)

		await helper.updateBooks()

		expect(BookModel.find).toHaveBeenCalledWith({}, projection)
		expect(processBatchByRegion).not.toHaveBeenCalled()
	})

	test('updateChapters uses sequential processing when USE_PARALLEL_SCHEDULER is false', async () => {
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: false }))

		mockChapterFind.mockResolvedValueOnce([chaptersWithoutProjection]).mockResolvedValueOnce([])
		mockChapterHandler.mockResolvedValue(undefined)

		await helper.updateChapters()

		expect(ChapterModel.find).toHaveBeenCalledWith({}, projection)
		expect(processBatchByRegion).not.toHaveBeenCalled()
	})

	test('updateAuthors logs warning when maxConcurrencyObserved exceeds configured concurrency', async () => {
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: true }))

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

	describe('adaptive cooldown integration', () => {
		test('serial mode sleeps the cooldown after every item, including failures', async () => {
			setPerformanceConfig(
				createTestPerformanceConfig({
					USE_PARALLEL_SCHEDULER: false,
					JITTER_MS: { min: 0, max: 0 }
				})
			)
			const twoDocs = [authorWithoutProjection, { ...authorWithoutProjection, asin: 'B0000000X2' }]
			mockAuthorFind.mockResolvedValueOnce(twoDocs).mockResolvedValueOnce([])
			mockAuthorHandler
				.mockResolvedValueOnce(undefined)
				.mockRejectedValueOnce(new Error('upstream 503'))

			await helper.updateAuthors()

			// one cooldown sleep per item — the rejection did not skip it
			expect(mockSleepCooldown).toHaveBeenCalledTimes(2)
		})

		test('serial mode registers success only for a fresh fetch, not stored data', async () => {
			setPerformanceConfig(
				createTestPerformanceConfig({
					USE_PARALLEL_SCHEDULER: false,
					JITTER_MS: { min: 0, max: 0 }
				})
			)
			mockAuthorFind
				.mockResolvedValueOnce([authorWithoutProjection])
				.mockResolvedValueOnce([authorWithoutProjection])
				.mockResolvedValueOnce([])
			// First item fetched fresh (cooldown decays); the second returned
			// stored data — the recency gate / region-refusal fallback — and
			// must NOT relax the cooldown.
			authorFreshData.fetched = true
			mockAuthorHandler.mockImplementation(async () => {
				authorFreshData.fetched = false
				return undefined
			})

			await helper.updateAuthors()

			expect(mockRegisterSuccess).toHaveBeenCalledTimes(1)
		})

		test('parallel mode sleeps the cooldown after every item, including failures', async () => {
			setPerformanceConfig(
				createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: true, JITTER_MS: { min: 0, max: 0 } })
			)
			const twoDocs = [authorWithoutProjection, { ...authorWithoutProjection, asin: 'B0000000X2' }]
			mockAuthorFind.mockResolvedValueOnce(twoDocs).mockResolvedValueOnce([])
			mockAuthorHandler
				.mockResolvedValueOnce(undefined)
				.mockRejectedValueOnce(new Error('upstream 503'))
			mockProcessBatchByRegion.mockImplementation(createProcessBatchByRegionMock())

			await helper.updateAuthors()

			// parallel mode must pace too (shared upstream reputation) —
			// once per item, and after the rejection
			expect(mockSleepCooldown).toHaveBeenCalledTimes(2)
		})

		test('parallel mode registers success only for a fresh fetch', async () => {
			setPerformanceConfig(
				createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: true, JITTER_MS: { min: 0, max: 0 } })
			)
			mockAuthorFind.mockResolvedValueOnce([authorWithoutProjection]).mockResolvedValueOnce([])
			authorFreshData.fetched = false // stored-data return
			mockAuthorHandler.mockResolvedValue(undefined)
			mockProcessBatchByRegion.mockImplementation(createProcessBatchByRegionMock())

			await helper.updateAuthors()

			expect(mockRegisterSuccess).not.toHaveBeenCalled()
		})
	})
})

afterAll(() => {
	mock.restore()
})
