jest.mock('@fastify/redis')
jest.mock('#config/models/Author')
jest.mock('#helpers/routes/AuthorShowHelper')
import type { FastifyRedis } from '@fastify/redis'
import type { FastifyBaseLogger } from 'fastify'
import { mock } from 'jest-mock-extended'

import AuthorModel from '#config/models/Author'
import type { PerformanceConfig } from '#config/performance'
import { resetPerformanceConfig, setPerformanceConfig } from '#config/performance'
import AuthorShowHelper from '#helpers/routes/AuthorShowHelper'
import UpdateScheduler from '#helpers/utils/UpdateScheduler'

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
	client: mock<FastifyRedis>()
})

describe('UpdateScheduler parallel processing', () => {
	let helper: UpdateScheduler

	beforeEach(() => {
		const ctx = createMockContext()
		const mockLogger = mock<FastifyBaseLogger>()
		helper = new UpdateScheduler(1, ctx.client, mockLogger)
		resetPerformanceConfig()
	})

	afterEach(() => {
		resetPerformanceConfig()
		jest.restoreAllMocks()
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

		jest.spyOn(AuthorModel, 'find').mockResolvedValue(authors as never)

		let concurrentCount = 0
		let maxConcurrent = 0
		jest.spyOn(AuthorShowHelper.prototype, 'handler').mockImplementation(async () => {
			concurrentCount++
			maxConcurrent = Math.max(maxConcurrent, concurrentCount)
			await new Promise((resolve) => setTimeout(resolve, 10))
			concurrentCount--
			return undefined
		})

		const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0)
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

		jest.spyOn(AuthorModel, 'find').mockResolvedValue(authors as never)

		let concurrentCount = 0
		let maxConcurrent = 0
		jest.spyOn(AuthorShowHelper.prototype, 'handler').mockImplementation(async () => {
			concurrentCount++
			maxConcurrent = Math.max(maxConcurrent, concurrentCount)
			await new Promise((resolve) => setTimeout(resolve, 10))
			concurrentCount--
			return undefined
		})

		const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0)
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

		jest.spyOn(AuthorModel, 'find').mockResolvedValue(authors as never)
		const handlerSpy = jest.spyOn(AuthorShowHelper.prototype, 'handler')
		handlerSpy
			.mockRejectedValueOnce(new Error('fail'))
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(undefined)

		const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0)
		await expect(helper.updateAuthors()).resolves.toBeUndefined()
		randomSpy.mockRestore()

		expect(handlerSpy).toHaveBeenCalledTimes(3)
	})
})
