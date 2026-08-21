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

mock.module('#helpers/routes/AuthorShowHelper', () => ({
	default: class AuthorShowHelper {
		handler = mockAuthorHandler
	}
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
})
