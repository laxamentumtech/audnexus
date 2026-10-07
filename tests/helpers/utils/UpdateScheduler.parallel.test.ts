import type { FastifyRedis } from '@fastify/redis'
import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

import { resetPerformanceConfig, setPerformanceConfig } from '#config/performance'
import UpdateScheduler from '#helpers/utils/UpdateScheduler'
import { createMockLogger } from '#tests/setup/mockLogger'
import { createTestPerformanceConfig } from '#tests/setup/performanceConfig'

const mockAuthorFind = mock()
const mockAuthorHandler = mock()

mock.module('#config/models/Author', () => ({
	default: { find: mockAuthorFind }
}))

const authorFreshData = { fetched: true }

mock.module('#helpers/routes/AuthorShowHelper', () => ({
	default: class AuthorShowHelper {
		handler = mockAuthorHandler
		fetchedFreshData = authorFreshData.fetched
	}
}))

// Cooldown is process-global and sleeps real time; stub it so the parallel
// pacing test asserts calls without waiting.
const mockSleepCooldown = mock()
const mockRegisterSuccess = mock()

mock.module('#helpers/utils/adaptiveCooldown', () => ({
	sleepCooldown: mockSleepCooldown,
	registerSuccess: mockRegisterSuccess
}))

mock.module('@fastify/redis', () => ({}))

type MockContext = {
	client: FastifyRedis
}

const createMockContext = (): MockContext => ({
	client: {
		get: mock(),
		set: mock(),
		del: mock(),
		ping: mock(),
		expire: mock()
	}
})

describe('UpdateScheduler parallel processing', () => {
	let helper: UpdateScheduler

	beforeEach(() => {
		const ctx = createMockContext()
		const mockLogger = createMockLogger()
		helper = new UpdateScheduler(ctx.client, mockLogger)
		resetPerformanceConfig()
		mockAuthorFind.mockReset()
		mockAuthorHandler.mockReset()
		mockSleepCooldown.mockReset()
		mockSleepCooldown.mockResolvedValue(undefined)
		mockRegisterSuccess.mockReset()
		authorFreshData.fetched = true
	})

	afterEach(() => {
		resetPerformanceConfig()
		mock.restore()
	})

	afterAll(() => {
		mock.restore()
	})

	it('caps per-region concurrency at 5', async () => {
		setPerformanceConfig(
			createTestPerformanceConfig({
				USE_PARALLEL_SCHEDULER: true,
				SCHEDULER_CONCURRENCY: 10
			})
		)

		const authors = Array.from({ length: 12 }, (_, index) => ({
			asin: `A${index}`,
			region: 'us'
		}))

		mockAuthorFind.mockResolvedValueOnce(authors).mockResolvedValueOnce([])

		let concurrentCount = 0
		let maxConcurrent = 0
		mockAuthorHandler.mockImplementation(async () => {
			concurrentCount++
			maxConcurrent = Math.max(maxConcurrent, concurrentCount)
			await new Promise((resolve) => setTimeout(resolve, 10))
			concurrentCount--
			return undefined
		})

		const randomSpy = spyOn(Math, 'random').mockReturnValue(0)
		await expect(helper.updateAuthors()).resolves.toBeUndefined()
		randomSpy.mockRestore()

		expect(maxConcurrent).toBeLessThanOrEqual(5)
	})

	it('respects overall concurrency across regions', async () => {
		setPerformanceConfig(
			createTestPerformanceConfig({
				USE_PARALLEL_SCHEDULER: true,
				SCHEDULER_CONCURRENCY: 5
			})
		)

		const authors = [
			{ asin: 'A1', region: 'us' },
			{ asin: 'A2', region: 'us' },
			{ asin: 'A3', region: 'us' },
			{ asin: 'B1', region: 'uk' },
			{ asin: 'B2', region: 'uk' },
			{ asin: 'B3', region: 'uk' }
		]

		mockAuthorFind.mockResolvedValueOnce(authors).mockResolvedValueOnce([])

		let concurrentCount = 0
		let maxConcurrent = 0
		mockAuthorHandler.mockImplementation(async () => {
			concurrentCount++
			maxConcurrent = Math.max(maxConcurrent, concurrentCount)
			await new Promise((resolve) => setTimeout(resolve, 10))
			concurrentCount--
			return undefined
		})

		const randomSpy = spyOn(Math, 'random').mockReturnValue(0)
		await expect(helper.updateAuthors()).resolves.toBeUndefined()
		randomSpy.mockRestore()

		expect(maxConcurrent).toBeLessThanOrEqual(5)
	})

	it('continues processing when one item fails', async () => {
		setPerformanceConfig(
			createTestPerformanceConfig({
				USE_PARALLEL_SCHEDULER: true,
				SCHEDULER_CONCURRENCY: 5
			})
		)

		const authors = [
			{ asin: 'A1', region: 'us' },
			{ asin: 'A2', region: 'us' },
			{ asin: 'A3', region: 'us' }
		]

		mockAuthorFind.mockResolvedValueOnce(authors).mockResolvedValueOnce([])
		mockAuthorHandler
			.mockRejectedValueOnce(new Error('fail'))
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(undefined)

		const randomSpy = spyOn(Math, 'random').mockReturnValue(0)
		await expect(helper.updateAuthors()).resolves.toBeUndefined()
		randomSpy.mockRestore()

		expect(mockAuthorHandler).toHaveBeenCalledTimes(3)
	})

	it('sleeps the adaptive cooldown after every item (including failures) and decays only on fresh fetches', async () => {
		setPerformanceConfig(
			createTestPerformanceConfig({
				USE_PARALLEL_SCHEDULER: true,
				SCHEDULER_CONCURRENCY: 5,
				JITTER_MS: { min: 0, max: 0 }
			})
		)

		const authors = [
			{ asin: 'A1', region: 'us' },
			{ asin: 'A2', region: 'us' },
			{ asin: 'A3', region: 'us' }
		]

		mockAuthorFind.mockResolvedValueOnce(authors).mockResolvedValueOnce([])
		// A2 returns stored data (fetchedFreshData stays false on that call);
		// A3 rejects (e.g. an upstream 503). All three must sleep the
		// cooldown — the rejection must not skip it — and only the two fresh
		// fetches register a usable success.
		mockAuthorHandler.mockImplementation(async () => {
			authorFreshData.fetched = true
			const callNumber = mockAuthorHandler.mock.calls.length
			if (callNumber === 2) {
				authorFreshData.fetched = false // stored-data return
				return undefined
			}
			if (callNumber === 3) {
				throw new Error('upstream 503')
			}
			return undefined
		})

		const randomSpy = spyOn(Math, 'random').mockReturnValue(0)
		await expect(helper.updateAuthors()).resolves.toBeUndefined()
		randomSpy.mockRestore()

		expect(mockSleepCooldown).toHaveBeenCalledTimes(3)
		expect(mockRegisterSuccess).toHaveBeenCalledTimes(2)
	})
})
