import type { FastifyRedis } from '@fastify/redis'
import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

import type { PerformanceConfig } from '#config/performance'
import { resetPerformanceConfig, setPerformanceConfig } from '#config/performance'
import UpdateScheduler from '#helpers/utils/UpdateScheduler'
import { createMockLogger } from '#tests/setup/mockLogger'

const mockAuthorFind = mock()
const mockAuthorHandler = mock()

mock.module('#config/models/Author', () => ({
	default: { find: mockAuthorFind }
}))

mock.module('#helpers/routes/AuthorShowHelper', () => ({
	default: class AuthorShowHelper {
		handler = mockAuthorHandler
	}
}))

mock.module('@fastify/redis', () => ({}))

type MockContext = {
	client: FastifyRedis
}

const createTestConfig = (overrides: Partial<PerformanceConfig>): PerformanceConfig => ({
	USE_PARALLEL_SCHEDULER: true,
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
		helper = new UpdateScheduler(1, ctx.client, mockLogger)
		resetPerformanceConfig()
		mockAuthorFind.mockReset()
		mockAuthorHandler.mockReset()
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
			createTestConfig({
				USE_PARALLEL_SCHEDULER: true,
				SCHEDULER_CONCURRENCY: 10
			})
		)

		const authors = Array.from({ length: 12 }, (_, index) => ({
			asin: `A${index}`,
			region: 'us'
		}))

		mockAuthorFind.mockResolvedValue(authors)

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
			createTestConfig({
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

		mockAuthorFind.mockResolvedValue(authors)

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
			createTestConfig({
				USE_PARALLEL_SCHEDULER: true,
				SCHEDULER_CONCURRENCY: 5
			})
		)

		const authors = [
			{ asin: 'A1', region: 'us' },
			{ asin: 'A2', region: 'us' },
			{ asin: 'A3', region: 'us' }
		]

		mockAuthorFind.mockResolvedValue(authors)
		mockAuthorHandler
			.mockRejectedValueOnce(new Error('fail'))
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(undefined)

		const randomSpy = spyOn(Math, 'random').mockReturnValue(0)
		await expect(helper.updateAuthors()).resolves.toBeUndefined()
		randomSpy.mockRestore()

		expect(mockAuthorHandler).toHaveBeenCalledTimes(3)
	})
})
