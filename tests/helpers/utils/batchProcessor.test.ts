import {
	PerformanceConfig,
	resetPerformanceConfig,
	setPerformanceConfig
} from '#config/performance'
import { normalizeRegion, processBatch, processBatchByRegion } from '#helpers/utils/batchProcessor'

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
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: false,
					SCHEDULER_CONCURRENCY: 5
				})
			)

			const items = [1, 2, 3]
			const processor = jest.fn().mockResolvedValue('result')

			const { summary } = await processBatch(items, processor)

			expect(processor).toHaveBeenCalledTimes(3)
			expect(processor).toHaveBeenCalledWith(1)
			expect(processor).toHaveBeenCalledWith(2)
			expect(processor).toHaveBeenCalledWith(3)
			expect(summary.total).toBe(3)
			expect(summary.success).toBe(3)
		})

		it('should process items in parallel when USE_PARALLEL_SCHEDULER is true', async () => {
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: true,
					SCHEDULER_CONCURRENCY: 5
				})
			)

			const items = [1, 2, 3]
			const processor = jest.fn().mockResolvedValue('result')

			const { summary } = await processBatch(items, processor)

			expect(processor).toHaveBeenCalledTimes(3)
			expect(summary.total).toBe(3)
		})

		it('should return results in order', async () => {
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: true,
					SCHEDULER_CONCURRENCY: 5
				})
			)

			const items = [1, 2, 3]
			const processor = jest.fn().mockImplementation((item) => Promise.resolve(item * 2))

			const { results } = await processBatch(items, processor)

			expect(results).toEqual([2, 4, 6])
		})

		it('should continue processing when individual items fail', async () => {
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: true,
					SCHEDULER_CONCURRENCY: 5
				})
			)

			const items = [1, 2, 3]
			const processor = jest.fn().mockImplementation((item) => {
				if (item === 2) {
					return Promise.reject(new Error('Failed'))
				}
				return Promise.resolve(item * 2)
			})

			const { results } = await processBatch(items, processor)

			expect(results).toEqual([2, undefined, 6])
		})

		it('should return undefined for failed items in sequential mode', async () => {
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: false,
					SCHEDULER_CONCURRENCY: 5
				})
			)

			const items = [1, 2, 3]
			const processor = jest.fn().mockImplementation((item) => {
				if (item === 2) {
					return Promise.reject(new Error('Failed'))
				}
				return Promise.resolve(item * 2)
			})

			const { results } = await processBatch(items, processor)

			expect(results).toEqual([2, undefined, 6])
		})

		it('should respect concurrency limit', async () => {
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: true,
					SCHEDULER_CONCURRENCY: 2
				})
			)

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

			const { summary } = await processBatch(items, processor)

			expect(maxConcurrent).toBeLessThanOrEqual(2)
			expect(summary.maxConcurrencyObserved).toBeLessThanOrEqual(2)
		})

		it('should throw when concurrency exceeds guardrail', async () => {
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: true,
					SCHEDULER_CONCURRENCY: 2
				})
			)

			const items = [1, 2]
			const processor = jest.fn().mockResolvedValue('result')

			await expect(processBatch(items, processor, { concurrency: 3 })).rejects.toThrow(
				'Concurrency exceeds SCHEDULER_CONCURRENCY guardrail'
			)
		})

		it('should throw when SCHEDULER_CONCURRENCY is invalid', async () => {
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: true,
					SCHEDULER_CONCURRENCY: 0
				})
			)

			const items = [1]
			const processor = jest.fn().mockResolvedValue('result')

			await expect(processBatch(items, processor)).rejects.toThrow(
				'SCHEDULER_CONCURRENCY must be at least 1'
			)
		})
	})

	describe('processBatchByRegion', () => {
		it('should process items sequentially when USE_PARALLEL_SCHEDULER is false', async () => {
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: false,
					SCHEDULER_CONCURRENCY: 5
				})
			)

			const items = [
				{ id: 1, region: 'us' },
				{ id: 2, region: 'uk' }
			]
			const processor = jest.fn().mockResolvedValue('result')

			await processBatchByRegion(items, processor)

			expect(processor).toHaveBeenCalledTimes(2)
		})

		it('should group items by region and process with per-region concurrency', async () => {
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: true,
					SCHEDULER_CONCURRENCY: 2
				})
			)

			const items = [
				{ id: 1, region: 'us' },
				{ id: 2, region: 'us' },
				{ id: 3, region: 'us' },
				{ id: 4, region: 'uk' },
				{ id: 5, region: 'uk' }
			]

			const processor = jest.fn().mockResolvedValue('result')

			const { summary } = await processBatchByRegion(items, processor)

			expect(processor).toHaveBeenCalledTimes(5)
			expect(summary.regions).toEqual({ us: 3, uk: 2 })
		})

		it('should handle items without region', async () => {
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: true,
					SCHEDULER_CONCURRENCY: 5
				})
			)

			const items = [{ id: 1, region: null }, { id: 2, region: undefined }, { id: 3 }]
			const processor = jest.fn().mockResolvedValue('result')

			const { summary } = await processBatchByRegion(items, processor)

			expect(processor).toHaveBeenCalledTimes(3)
			expect(summary.regions.us).toBe(3)
		})

		it('should cap per-region concurrency at 5 by default', async () => {
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: true,
					SCHEDULER_CONCURRENCY: 10
				})
			)

			const items = Array.from({ length: 12 }, (_, index) => ({
				id: index + 1,
				region: 'us'
			}))

			let concurrentCount = 0
			let maxConcurrent = 0
			const processor = jest.fn().mockImplementation(async () => {
				concurrentCount++
				maxConcurrent = Math.max(maxConcurrent, concurrentCount)
				await new Promise((resolve) => setTimeout(resolve, 10))
				concurrentCount--
				return 'result'
			})

			const { summary } = await processBatchByRegion(items, processor)

			expect(maxConcurrent).toBeLessThanOrEqual(5)
			expect(summary.maxConcurrencyObserved).toBeLessThanOrEqual(5)
		})

		it('should allow overriding per-region concurrency with options.maxPerRegion', async () => {
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: true,
					SCHEDULER_CONCURRENCY: 8
				})
			)

			const items = Array.from({ length: 6 }, (_, index) => ({
				id: index + 1,
				region: 'us'
			}))

			let concurrentCount = 0
			let maxConcurrent = 0
			const processor = jest.fn().mockImplementation(async () => {
				concurrentCount++
				maxConcurrent = Math.max(maxConcurrent, concurrentCount)
				await new Promise((resolve) => setTimeout(resolve, 10))
				concurrentCount--
				return 'result'
			})

			const { summary } = await processBatchByRegion(items, processor, { maxPerRegion: 2 })

			expect(maxConcurrent).toBeLessThanOrEqual(2)
			expect(summary.maxConcurrencyObserved).toBeLessThanOrEqual(2)
		})

		it('should continue processing when individual items fail', async () => {
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: true,
					SCHEDULER_CONCURRENCY: 5
				})
			)

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

			const { results, summary } = await processBatchByRegion(items, processor)

			expect(results).toHaveLength(3)
			expect((results as Array<{ id: number } | undefined>)[0]).toEqual({ id: 2 })
			expect(results[1]).toBeUndefined()
			expect((results as Array<{ id: number } | undefined>)[2]).toEqual({ id: 6 })
			expect(summary.failures).toBe(1)
		})

		it('should return undefined for failed items in sequential mode', async () => {
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: false,
					SCHEDULER_CONCURRENCY: 5
				})
			)

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

			const { results, summary } = await processBatchByRegion(items, processor)

			expect(results).toHaveLength(3)
			expect((results as Array<{ id: number } | undefined>)[0]).toEqual({ id: 2 })
			expect(results[1]).toBeUndefined()
			expect((results as Array<{ id: number } | undefined>)[2]).toEqual({ id: 6 })
			expect(summary.failures).toBe(1)
		})

		it('should use options.concurrency over config when provided', async () => {
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: true,
					SCHEDULER_CONCURRENCY: 5
				})
			)

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

			const { summary } = await processBatchByRegion(
				items.map((id) => ({ id, region: 'us' })),
				processor,
				{ concurrency: 1 }
			)

			expect(maxConcurrent).toBeLessThanOrEqual(1)
			expect(summary.maxConcurrencyObserved).toBeLessThanOrEqual(1)
		})

		it('should throw when concurrency exceeds guardrail', async () => {
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: true,
					SCHEDULER_CONCURRENCY: 2
				})
			)

			const items = [{ id: 1, region: 'us' }]
			const processor = jest.fn().mockResolvedValue('result')

			await expect(processBatchByRegion(items, processor, { concurrency: 4 })).rejects.toThrow(
				'Concurrency exceeds SCHEDULER_CONCURRENCY guardrail'
			)
		})

		it('should throw when per-region concurrency exceeds overall concurrency', async () => {
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: true,
					SCHEDULER_CONCURRENCY: 2
				})
			)

			const items = [{ id: 1, region: 'us' }]
			const processor = jest.fn().mockResolvedValue('result')

			await expect(processBatchByRegion(items, processor, { maxPerRegion: 3 })).rejects.toThrow(
				'Per-region concurrency exceeds overall concurrency guardrail'
			)
		})

		it('should throw when SCHEDULER_CONCURRENCY is invalid', async () => {
			setPerformanceConfig(
				createTestConfig({
					USE_PARALLEL_SCHEDULER: true,
					SCHEDULER_CONCURRENCY: 0
				})
			)

			const items = [{ id: 1, region: 'us' }]
			const processor = jest.fn().mockResolvedValue('result')

			await expect(processBatchByRegion(items, processor)).rejects.toThrow(
				'SCHEDULER_CONCURRENCY must be at least 1'
			)
		})
	})

	describe('normalizeRegion', () => {
		it('should return provided defaultRegion when region is undefined', () => {
			const result = normalizeRegion(undefined, 'uk')
			expect(result).toBe('uk')
		})

		it('should return provided defaultRegion when region is empty string', () => {
			const result = normalizeRegion('', 'de')
			expect(result).toBe('de')
		})

		it('should return config DEFAULT_REGION when no defaultRegion provided and region is undefined', () => {
			setPerformanceConfig(createTestConfig({ DEFAULT_REGION: 'fr' }))
			const result = normalizeRegion(undefined)
			expect(result).toBe('fr')
		})

		it('should return the region when region is provided', () => {
			const result = normalizeRegion('us', 'uk')
			expect(result).toBe('us')
		})

		it('should return defaultRegion when region is null', () => {
			const result = normalizeRegion(null, 'ca')
			expect(result).toBe('ca')
		})
	})
})
