import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { ObjectId } from 'mongodb'

import { createMockLogger } from '#tests/setup/mockLogger'

const mockAuthorFind = mock()
const mockAuthorUpdateOne = mock()
const mockBookFind = mock()
const mockBookUpdateOne = mock()
const mockChapterFind = mock()
const mockChapterUpdateOne = mock()

mock.module('#config/models/Author', () => ({
	default: { find: mockAuthorFind, updateOne: mockAuthorUpdateOne }
}))

mock.module('#config/models/Book', () => ({
	default: { find: mockBookFind, updateOne: mockBookUpdateOne }
}))

mock.module('#config/models/Chapter', () => ({
	default: { find: mockChapterFind, updateOne: mockChapterUpdateOne }
}))

const mockAuthorHandler = mock()
const mockBookHandler = mock()
const mockChapterHandler = mock()

// Fresh-fetch + persistence signals on the helper. `fetchedFreshData` drives
// the cooldown decay (registerSuccess); `persisted` drives the `updated`
// outcome (the pre-order transient path sets fetchedFreshData but not
// persisted, and must count as `unchanged`).
const authorFresh = { fetched: true, persisted: true }
const bookFresh = { fetched: true, persisted: true }
const chapterFresh = { fetched: true, persisted: true }

mock.module('#helpers/routes/AuthorShowHelper', () => ({
	default: class AuthorShowHelper {
		handler = mockAuthorHandler
		fetchedFreshData = authorFresh.fetched
		persisted = authorFresh.persisted
	}
}))

mock.module('#helpers/routes/BookShowHelper', () => ({
	default: class BookShowHelper {
		handler = mockBookHandler
		fetchedFreshData = bookFresh.fetched
		persisted = bookFresh.persisted
	}
}))

mock.module('#helpers/routes/ChapterShowHelper', () => ({
	default: class ChapterShowHelper {
		handler = mockChapterHandler
		fetchedFreshData = chapterFresh.fetched
		persisted = chapterFresh.persisted
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

import { resetPerformanceConfig, setPerformanceConfig } from '#config/performance'
import { processBatchByRegion } from '#helpers/utils/batchProcessor'
import UpdateScheduler from '#helpers/utils/UpdateScheduler'
import { UpstreamGoneError } from '#helpers/utils/upstreamGone'
import { createTestPerformanceConfig } from '#tests/setup/performanceConfig'

type MockContext = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	client: any
}

let ctx: MockContext
let helper: UpdateScheduler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockLogger: any

// The stale walk projects asin/region/updatedAt, sorts by the compound
// (updatedAt, _id) key, and pages at the default SCHEDULER_BATCH_SIZE (1000).
const staleProjection = {
	projection: { asin: 1, region: 1, updatedAt: 1 },
	sort: { updatedAt: 1, _id: 1 },
	limit: 1000
}

let idCounter = 0
const makeStaleDoc = (
	overrides: {
		_id?: ObjectId
		asin?: string
		region?: string | null
		updatedAt?: Date
	} = {}
) => ({
	_id: overrides._id ?? new ObjectId(),
	asin: overrides.asin ?? `B0STALE${++idCounter}`,
	region: overrides.region ?? 'us',
	updatedAt: overrides.updatedAt ?? new Date('2020-01-01T00:00:00.000Z')
})

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

// Drives each batch's items through the worker in order; counts a success per
// resolved item and a failure per rejection (the parallel-mode pacing proxy).
const createProcessBatchByRegionMock =
	() =>
	async <T, R>(items: T[], worker: (item: T) => Promise<R>) => {
		const results: R[] = []
		let successes = 0
		let failures = 0
		for (const item of items) {
			try {
				results.push(await worker(item))
				successes += 1
			} catch {
				failures += 1
			}
		}
		return {
			results,
			summary: {
				total: items.length,
				success: successes,
				failures,
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
	mockAuthorUpdateOne.mockClear()
	mockAuthorUpdateOne.mockResolvedValue({ acknowledged: true })
	mockBookFind.mockClear()
	mockBookUpdateOne.mockClear()
	mockBookUpdateOne.mockResolvedValue({ acknowledged: true })
	mockChapterFind.mockClear()
	mockChapterUpdateOne.mockClear()
	mockChapterUpdateOne.mockResolvedValue({ acknowledged: true })
	mockAuthorHandler.mockClear()
	mockBookHandler.mockClear()
	mockChapterHandler.mockClear()
	mockProcessBatchByRegion.mockClear()
	mockSleepCooldown.mockClear()
	mockSleepCooldown.mockResolvedValue(undefined)
	mockRegisterSuccess.mockClear()
	// Default: the handler fetched fresh data and persisted it.
	authorFresh.fetched = true
	authorFresh.persisted = true
	bookFresh.fetched = true
	bookFresh.persisted = true
	chapterFresh.fetched = true
	chapterFresh.persisted = true
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

	test('walks authors stalest-first with the updatedAt filter', async () => {
		const doc = makeStaleDoc()
		mockAuthorFind.mockResolvedValueOnce([doc]).mockResolvedValueOnce([])
		mockAuthorHandler.mockResolvedValue(undefined)
		await helper.updateAuthors()
		// First page: only the staleness window, no continuation cursor.
		expect(mockAuthorFind.mock.calls[0][0]).toEqual({
			updatedAt: { $lte: expect.any(Date) }
		})
		expect(mockAuthorFind).toHaveBeenNthCalledWith(
			1,
			{ updatedAt: { $lte: expect.any(Date) } },
			staleProjection
		)
		// Second page: compound (updatedAt, _id) continuation.
		expect(mockAuthorFind.mock.calls[1][0]).toEqual({
			updatedAt: { $lte: expect.any(Date) },
			$or: [
				{ updatedAt: { $gt: doc.updatedAt } },
				{ updatedAt: doc.updatedAt, _id: { $gt: doc._id } }
			]
		})
	})

	test('walks books stalest-first with the updatedAt filter', async () => {
		mockBookFind.mockResolvedValueOnce([makeStaleDoc()]).mockResolvedValueOnce([])
		mockBookHandler.mockResolvedValue(undefined)
		await helper.updateBooks()
		expect(mockBookFind).toHaveBeenNthCalledWith(
			1,
			{ updatedAt: { $lte: expect.any(Date) } },
			staleProjection
		)
	})

	test('walks chapters stalest-first with the updatedAt filter', async () => {
		mockChapterFind.mockResolvedValueOnce([makeStaleDoc()]).mockResolvedValueOnce([])
		mockChapterHandler.mockResolvedValue(undefined)
		await helper.updateChapters()
		expect(mockChapterFind).toHaveBeenNthCalledWith(
			1,
			{ updatedAt: { $lte: expect.any(Date) } },
			staleProjection
		)
	})

	test('returns a PassSummary with updated', async () => {
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: false }))
		mockAuthorFind.mockResolvedValueOnce([makeStaleDoc()]).mockResolvedValueOnce([])
		mockAuthorHandler.mockResolvedValue(undefined)
		// fetched + persisted → updated
		const pass = await helper.updateAuthors()
		expect(pass).toEqual({ total: 1, updated: 1, unchanged: 0, gone: 0, failures: 0 })
		expect(mockAuthorUpdateOne).not.toHaveBeenCalled()
	})

	test('pre-order transient path counts as unchanged and marks checked', async () => {
		setPerformanceConfig(
			createTestPerformanceConfig({
				USE_PARALLEL_SCHEDULER: false,
				JITTER_MS: { min: 0, max: 0 }
			})
		)
		mockAuthorFind.mockResolvedValueOnce([makeStaleDoc()]).mockResolvedValueOnce([])
		mockAuthorHandler.mockResolvedValue(undefined)
		// fetchedFreshData true, persisted false → unchanged (not updated),
		// but the row must leave the staleness window via markChecked.
		authorFresh.fetched = true
		authorFresh.persisted = false
		const pass = await helper.updateAuthors()
		expect(pass).toEqual({ total: 1, updated: 0, unchanged: 1, gone: 0, failures: 0 })
		expect(mockRegisterSuccess).toHaveBeenCalledTimes(1)
		expect(mockAuthorUpdateOne).toHaveBeenCalledTimes(1)
		expect(mockAuthorUpdateOne.mock.calls[0][1]).toEqual({ $currentDate: { updatedAt: true } })
	})

	test('gone outcome marks checked and does not count a failure', async () => {
		setPerformanceConfig(
			createTestPerformanceConfig({
				USE_PARALLEL_SCHEDULER: false,
				JITTER_MS: { min: 0, max: 0 }
			})
		)
		mockAuthorFind.mockResolvedValueOnce([makeStaleDoc()]).mockResolvedValueOnce([])
		mockAuthorHandler.mockRejectedValue(
			new UpstreamGoneError('https://www.audible.com/search?advsearchKeywords=')
		)
		const pass = await helper.updateAuthors()
		expect(pass).toEqual({ total: 1, updated: 0, unchanged: 0, gone: 1, failures: 0 })
		expect(mockAuthorUpdateOne).toHaveBeenCalledTimes(1)
		expect(mockAuthorUpdateOne.mock.calls[0][1]).toEqual({ $currentDate: { updatedAt: true } })
		expect(mockLogger.error).not.toHaveBeenCalled()
	})

	test('non-gone thrown error counts a failure and does not mark checked', async () => {
		setPerformanceConfig(
			createTestPerformanceConfig({
				USE_PARALLEL_SCHEDULER: false,
				JITTER_MS: { min: 0, max: 0 }
			})
		)
		mockAuthorFind.mockResolvedValueOnce([makeStaleDoc()]).mockResolvedValueOnce([])
		mockAuthorHandler.mockRejectedValue(new Error('upstream 503'))
		const pass = await helper.updateAuthors()
		expect(pass).toEqual({ total: 1, updated: 0, unchanged: 0, gone: 0, failures: 1 })
		expect(mockAuthorUpdateOne).not.toHaveBeenCalled()
		expect(mockLogger.error).toHaveBeenCalledTimes(1)
	})

	test('honors SCHEDULER_MAX_ITEMS by stopping the walk', async () => {
		setPerformanceConfig(
			createTestPerformanceConfig({
				USE_PARALLEL_SCHEDULER: false,
				JITTER_MS: { min: 0, max: 0 },
				SCHEDULER_MAX_ITEMS: 1,
				SCHEDULER_BATCH_SIZE: 1
			})
		)
		const doc = makeStaleDoc()
		// First page returns one doc; the cap is hit after processing it, so
		// the batch callback returns false and no second page is fetched.
		mockAuthorFind.mockResolvedValueOnce([doc])
		mockAuthorHandler.mockResolvedValue(undefined)
		const pass = await helper.updateAuthors()
		expect(pass).toEqual({ total: 1, updated: 1, unchanged: 0, gone: 0, failures: 0 })
		expect(mockAuthorFind).toHaveBeenCalledTimes(1)
		expect(mockLogger.info).toHaveBeenCalledWith(
			'Authors pass complete: checked=1 updated=1 unchanged=0 gone=0 failures=0'
		)
	})

	test('updateAuthors with parallel processing when USE_PARALLEL_SCHEDULER is true', async () => {
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: true }))
		const doc = makeStaleDoc()
		mockAuthorFind.mockResolvedValueOnce([doc]).mockResolvedValueOnce([])
		mockAuthorHandler.mockResolvedValue(undefined)
		mockProcessBatchByRegion.mockImplementation(createProcessBatchByRegionMock())
		await helper.updateAuthors()
		expect(processBatchByRegion).toHaveBeenCalledWith([doc], expect.any(Function), {
			concurrency: 5,
			maxPerRegion: 5
		})
	})

	test('updateAuthors parallel mode registers success and marks checked', async () => {
		setPerformanceConfig(
			createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: true, JITTER_MS: { min: 0, max: 0 } })
		)
		mockAuthorFind.mockResolvedValueOnce([makeStaleDoc()]).mockResolvedValueOnce([])
		mockAuthorHandler.mockResolvedValue(undefined)
		mockProcessBatchByRegion.mockImplementation(createProcessBatchByRegionMock())
		// persisted → updated (no markChecked)
		const pass = await helper.updateAuthors()
		expect(pass).toEqual({ total: 1, updated: 1, unchanged: 0, gone: 0, failures: 0 })
		expect(mockRegisterSuccess).toHaveBeenCalledTimes(1)
		expect(mockAuthorUpdateOne).not.toHaveBeenCalled()
	})

	test('updateAuthors parallel mode counts a gone item', async () => {
		setPerformanceConfig(
			createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: true, JITTER_MS: { min: 0, max: 0 } })
		)
		mockAuthorFind.mockResolvedValueOnce([makeStaleDoc()]).mockResolvedValueOnce([])
		mockAuthorHandler.mockRejectedValue(
			new UpstreamGoneError('https://www.audible.com/search?advsearchKeywords=')
		)
		mockProcessBatchByRegion.mockImplementation(createProcessBatchByRegionMock())
		const pass = await helper.updateAuthors()
		expect(pass).toEqual({ total: 1, updated: 0, unchanged: 0, gone: 1, failures: 0 })
		expect(mockAuthorUpdateOne).toHaveBeenCalledTimes(1)
	})

	test('updateAuthors parallel mode counts a non-gone failure', async () => {
		setPerformanceConfig(
			createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: true, JITTER_MS: { min: 0, max: 0 } })
		)
		mockAuthorFind.mockResolvedValueOnce([makeStaleDoc()]).mockResolvedValueOnce([])
		mockAuthorHandler.mockRejectedValue(new Error('upstream 503'))
		mockProcessBatchByRegion.mockImplementation(createProcessBatchByRegionMock())
		const pass = await helper.updateAuthors()
		expect(pass).toEqual({ total: 1, updated: 0, unchanged: 0, gone: 0, failures: 1 })
		expect(mockAuthorUpdateOne).not.toHaveBeenCalled()
	})

	test('updateAuthors accumulates summary across successes and failures in sequential processing', async () => {
		setPerformanceConfig(
			createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: false, JITTER_MS: { min: 0, max: 0 } })
		)
		const usA = makeStaleDoc({ asin: 'B000000001', region: 'us' })
		const usB = makeStaleDoc({ asin: 'B000000002', region: 'us' })
		const regionless = makeStaleDoc({ asin: 'B000000003', region: undefined })
		mockAuthorFind.mockResolvedValueOnce([usA, usB, regionless]).mockResolvedValueOnce([])
		// Sequential processing invokes the handler in document order; the
		// third (region-less) doc's call rejects to exercise the failure branch.
		mockAuthorHandler
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error('Test error'))

		await helper.updateAuthors()

		expect(mockProcessBatchByRegion).not.toHaveBeenCalled()
		expect(mockAuthorHandler).toHaveBeenCalledTimes(3)
		expect(mockLogger.error).toHaveBeenCalledTimes(1)
		// Two persisted docs → updated=2; one rejection → failures=1.
		expect(mockLogger.info).toHaveBeenCalledWith(
			'Authors pass complete: checked=3 updated=2 unchanged=0 gone=0 failures=1'
		)
	})

	test('updateAuthors uses sequential processing when USE_PARALLEL_SCHEDULER is false', async () => {
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: false }))
		mockAuthorFind.mockResolvedValueOnce([makeStaleDoc()]).mockResolvedValueOnce([])
		mockAuthorHandler.mockResolvedValue(undefined)
		await helper.updateAuthors()
		expect(processBatchByRegion).not.toHaveBeenCalled()
	})

	test('updateBooks uses sequential processing when USE_PARALLEL_SCHEDULER is false', async () => {
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: false }))
		mockBookFind.mockResolvedValueOnce([makeStaleDoc()]).mockResolvedValueOnce([])
		mockBookHandler.mockResolvedValue(undefined)
		await helper.updateBooks()
		expect(processBatchByRegion).not.toHaveBeenCalled()
	})

	test('updateChapters uses sequential processing when USE_PARALLEL_SCHEDULER is false', async () => {
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: false }))
		mockChapterFind.mockResolvedValueOnce([makeStaleDoc()]).mockResolvedValueOnce([])
		mockChapterHandler.mockResolvedValue(undefined)
		await helper.updateChapters()
		expect(processBatchByRegion).not.toHaveBeenCalled()
	})

	test('updateAuthors logs warning when maxConcurrencyObserved exceeds configured concurrency', async () => {
		setPerformanceConfig(createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: true }))
		mockAuthorFind.mockResolvedValueOnce([makeStaleDoc()]).mockResolvedValueOnce([])
		mockAuthorHandler.mockResolvedValue(undefined)
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
			const twoDocs = [makeStaleDoc({ asin: 'B0000000X1' }), makeStaleDoc({ asin: 'B0000000X2' })]
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
				.mockResolvedValueOnce([makeStaleDoc({ asin: 'B0000000Y1' })])
				.mockResolvedValueOnce([makeStaleDoc({ asin: 'B0000000Y2' })])
				.mockResolvedValueOnce([])
			// First item fetched fresh (cooldown decays); the second returned
			// stored data — the recency gate / region-refusal fallback — and
			// must NOT relax the cooldown.
			mockAuthorHandler.mockImplementation(async () => {
				authorFresh.fetched = false
				return undefined
			})

			await helper.updateAuthors()

			expect(mockRegisterSuccess).toHaveBeenCalledTimes(1)
		})

		test('parallel mode sleeps the cooldown after every item, including failures', async () => {
			setPerformanceConfig(
				createTestPerformanceConfig({ USE_PARALLEL_SCHEDULER: true, JITTER_MS: { min: 0, max: 0 } })
			)
			const twoDocs = [makeStaleDoc({ asin: 'B0000000Z1' }), makeStaleDoc({ asin: 'B0000000Z2' })]
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
			mockAuthorFind.mockResolvedValueOnce([makeStaleDoc()]).mockResolvedValueOnce([])
			authorFresh.fetched = false // stored-data return
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
