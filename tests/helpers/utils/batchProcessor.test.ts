import { PerformanceConfig, resetPerformanceConfig, setPerformanceConfig } from '#config/performance'
import { processBatch, processBatchByRegion } from '#helpers/utils/batchProcessor'

const createTestConfig = (overrides: Partial<PerformanceConfig>): PerformanceConfig => ({
	USE_PARALLEL_SCHEDULER: false,
	USE_CONNECTION_POOLING: true,
	USE_COMPACT_JSON: true,
	USE_SORTED_KEYS: false,
	CIRCUIT_BREAKER_ENABLED: true,
	METRICS_ENABLED: true,
	MAX_CONCURRENT_REQUESTS: 50,
	SCHEDULER_CONCURRENCY: 5,
	...overrides
})

describe('batchProcessor', () => {
	const originalEnv = process.env

	beforeEach(() => {
		jest.resetModules()
		process.env = { ...originalEnv }
		resetPerformanceConfig()
	})

	afterAll(() => {
		process.env = originalEnv
	})

	describe('processBatch', () => {
		it('should process items sequentially when USE_PARALLEL_SCHEDULER is false', async () => {
			setPerformanceConfig(createTestConfig({
				USE_PARALLEL_SCHEDULER: false,
				SCHEDULER_CONCURRENCY: 5
			}))

			const items = [1, 2, 3]
			const processor = jest.fn().mockResolvedValue('result')

			await processBatch(items, processor)

			expect(processor).toHaveBeenCalledTimes(3)
			expect(processor).toHaveBeenCalledWith(1)
			expect(processor).toHaveBeenCalledWith(2)
			expect(processor).toHaveBeenCalledWith(3)
		})

		it('should process items in parallel when USE_PARALLEL_SCHEDULER is true', async () => {
			setPerformanceConfig(createTestConfig({
				USE_PARALLEL_SCHEDULER: true,
				SCHEDULER_CONCURRENCY: 5
			}))

			const items = [1, 2, 3]
			const processor = jest.fn().mockResolvedValue('result')

			await processBatch(items, processor)

			expect(processor).toHaveBeenCalledTimes(3)
		})

		it('should return results in order', async () => {
			setPerformanceConfig(createTestConfig({
				USE_PARALLEL_SCHEDULER: true,
				SCHEDULER_CONCURRENCY: 5
			}))

			const items = [1, 2, 3]
			const processor = jest.fn().mockImplementation((item) =>
				Promise.resolve(item * 2)
			)

			const results = await processBatch(items, processor)

			expect(results).toEqual([2, 4, 6])
		})

		it('should continue processing when individual items fail', async () => {
			setPerformanceConfig(createTestConfig({
				USE_PARALLEL_SCHEDULER: true,
				SCHEDULER_CONCURRENCY: 5
			}))

			const items = [1, 2, 3]
			const processor = jest.fn().mockImplementation((item) => {
				if (item === 2) {
					return Promise.reject(new Error('Failed'))
				}
				return Promise.resolve(item * 2)
			})

			const results = await processBatch(items, processor)

			expect(results).toEqual([2, undefined, 6])
		})

		it('should respect concurrency limit', async () => {
			setPerformanceConfig(createTestConfig({
				USE_PARALLEL_SCHEDULER: true,
				SCHEDULER_CONCURRENCY: 2
			}))

			const items = [1, 2, 3, 4, 5]
			let concurrentCount = 0
			let maxConcurrent = 0

			const processor = jest.fn().mockImplementation(async () => {
				concurrentCount++
				maxConcurrent = Math.max(maxConcurrent, concurrentCount)
				await new Promise((resolve) => setTimeout(resolve, 10))
				concurrentCount--
				return 'result'
			})

			await processBatch(items, processor)

			expect(maxConcurrent).toBeLessThanOrEqual(2)
		})
	})

	describe('processBatchByRegion', () => {
		it('should process items sequentially when USE_PARALLEL_SCHEDULER is false', async () => {
			setPerformanceConfig(createTestConfig({
				USE_PARALLEL_SCHEDULER: false,
				SCHEDULER_CONCURRENCY: 5
			}))

			const items = [
				{ id: 1, region: 'us' },
				{ id: 2, region: 'uk' }
			]
			const processor = jest.fn().mockResolvedValue('result')

			await processBatchByRegion(items, processor)

			expect(processor).toHaveBeenCalledTimes(2)
		})

		it('should group items by region and process with per-region concurrency', async () => {
			setPerformanceConfig(createTestConfig({
				USE_PARALLEL_SCHEDULER: true,
				SCHEDULER_CONCURRENCY: 2
			}))

			const items = [
				{ id: 1, region: 'us' },
				{ id: 2, region: 'us' },
				{ id: 3, region: 'us' },
				{ id: 4, region: 'uk' },
				{ id: 5, region: 'uk' }
			]

			const processor = jest.fn().mockResolvedValue('result')

			await processBatchByRegion(items, processor)

			expect(processor).toHaveBeenCalledTimes(5)
		})

		it('should handle items without region', async () => {
			setPerformanceConfig(createTestConfig({
				USE_PARALLEL_SCHEDULER: true,
				SCHEDULER_CONCURRENCY: 5
			}))

			const items = [
				{ id: 1, region: null },
				{ id: 2, region: undefined },
				{ id: 3 }
			]
			const processor = jest.fn().mockResolvedValue('result')

			await processBatchByRegion(items, processor)

			expect(processor).toHaveBeenCalledTimes(3)
		})

		it('should continue processing when individual items fail', async () => {
			setPerformanceConfig(createTestConfig({
				USE_PARALLEL_SCHEDULER: true,
				SCHEDULER_CONCURRENCY: 5
			}))

			const items = [
				{ id: 1, region: 'us' },
				{ id: 2, region: 'us' },
				{ id: 3, region: 'us' }
			]

			const processor = jest.fn().mockImplementation((item) => {
				if (item.id === 2) {
					return Promise.reject(new Error('Failed'))
				}
				return Promise.resolve({ id: item.id * 2 })
			})

			const results = await processBatchByRegion(items, processor)

			expect(results).toHaveLength(3)
			expect(results[0]).toEqual({ id: 2 })
			expect(results[1]).toBeUndefined()
			expect(results[2]).toEqual({ id: 6 })
		})

		it('should use options.concurrency over config when provided', async () => {
			setPerformanceConfig(createTestConfig({
				USE_PARALLEL_SCHEDULER: true,
				SCHEDULER_CONCURRENCY: 5
			}))

			const items = [1, 2, 3, 4, 5]
			let maxConcurrent = 0
			let concurrentCount = 0

			const processor = jest.fn().mockImplementation(async () => {
				concurrentCount++
				maxConcurrent = Math.max(maxConcurrent, concurrentCount)
				await new Promise((resolve) => setTimeout(resolve, 10))
				concurrentCount--
				return 'result'
			})

			await processBatchByRegion(
				items.map((id) => ({ id, region: 'us' })),
				processor,
				{ concurrency: 1 }
			)

			expect(maxConcurrent).toBeLessThanOrEqual(1)
		})
	})
})
