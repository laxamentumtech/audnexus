import {
	PerformanceConfig,
	resetPerformanceConfig,
	setPerformanceConfig
} from '#config/performance'
import {
	CircuitBreaker,
	getAudibleCircuitBreaker,
	resetAudibleCircuitBreaker
} from '#helpers/utils/CircuitBreaker'

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

describe('CircuitBreaker', () => {
	beforeEach(() => {
		resetPerformanceConfig()
		resetAudibleCircuitBreaker()
	})

	describe('basic operation', () => {
		it('should execute function successfully when CLOSED', async () => {
			const breaker = new CircuitBreaker()
			const fn = jest.fn().mockResolvedValue('success')

			const result = await breaker.execute(fn)

			expect(result).toBe('success')
			expect(fn).toHaveBeenCalledTimes(1)
		})

		it('should return initial state as CLOSED', () => {
			const breaker = new CircuitBreaker()
			const stats = breaker.getStats()

			expect(stats.state).toBe('CLOSED')
			expect(stats.failures).toBe(0)
			expect(stats.successes).toBe(0)
		})

		it('should track successes', async () => {
			const breaker = new CircuitBreaker()
			const fn = jest.fn().mockResolvedValue('success')

			await breaker.execute(fn)
			await breaker.execute(fn)

			const stats = breaker.getStats()
			expect(stats.successes).toBe(2)
		})

		it('should track failures', async () => {
			const breaker = new CircuitBreaker()
			const fn = jest.fn().mockRejectedValue(new Error('failed'))

			await expect(breaker.execute(fn)).rejects.toThrow('failed')

			const stats = breaker.getStats()
			expect(stats.failures).toBe(1)
		})
	})

	describe('state transitions', () => {
		it('should transition to OPEN after failure threshold', async () => {
			const breaker = new CircuitBreaker({ failureThreshold: 3 })
			const fn = jest.fn().mockRejectedValue(new Error('failed'))

			// Fail 3 times
			await expect(breaker.execute(fn)).rejects.toThrow()
			await expect(breaker.execute(fn)).rejects.toThrow()
			await expect(breaker.execute(fn)).rejects.toThrow()

			const stats = breaker.getStats()
			expect(stats.state).toBe('OPEN')
		})

		it('should fail fast when OPEN', async () => {
			const breaker = new CircuitBreaker({
				failureThreshold: 1,
				resetTimeoutMs: 60000
			})
			const failingFn = jest.fn().mockRejectedValue(new Error('failed'))
			const successFn = jest.fn().mockResolvedValue('success')

			// Open the circuit
			await expect(breaker.execute(failingFn)).rejects.toThrow()

			// Should fail fast with circuit breaker error
			await expect(breaker.execute(successFn)).rejects.toThrow('Circuit breaker is OPEN')
			expect(successFn).not.toHaveBeenCalled()
		})

		it('should transition to HALF_OPEN after reset timeout', async () => {
			const breaker = new CircuitBreaker({
				failureThreshold: 1,
				resetTimeoutMs: 10
			})
			const fn = jest.fn().mockRejectedValue(new Error('failed'))

			// Open the circuit
			await expect(breaker.execute(fn)).rejects.toThrow()
			expect(breaker.getStats().state).toBe('OPEN')

			// Wait for timeout
			await new Promise((resolve) => setTimeout(resolve, 20))

			// Check that it can execute (transitioned to HALF_OPEN)
			expect(breaker.canExecute()).toBe(true)
		})

		it('should transition back to CLOSED after success threshold in HALF_OPEN', async () => {
			const breaker = new CircuitBreaker({
				failureThreshold: 1,
				resetTimeoutMs: 10,
				successThreshold: 2
			})
			const failingFn = jest.fn().mockRejectedValue(new Error('failed'))
			const successFn = jest.fn().mockResolvedValue('success')

			// Open the circuit
			await expect(breaker.execute(failingFn)).rejects.toThrow()

			// Wait for timeout
			await new Promise((resolve) => setTimeout(resolve, 20))

			// Execute successfully twice
			await breaker.execute(successFn)
			expect(breaker.getStats().state).toBe('HALF_OPEN')

			await breaker.execute(successFn)
			expect(breaker.getStats().state).toBe('CLOSED')
		})

		it('should transition back to OPEN on failure in HALF_OPEN', async () => {
			const breaker = new CircuitBreaker({
				failureThreshold: 1,
				resetTimeoutMs: 10,
				successThreshold: 2
			})
			const failingFn = jest.fn().mockRejectedValue(new Error('failed'))

			// Open the circuit
			await expect(breaker.execute(failingFn)).rejects.toThrow()

			// Wait for timeout
			await new Promise((resolve) => setTimeout(resolve, 20))

			// Fail in HALF_OPEN
			await expect(breaker.execute(failingFn)).rejects.toThrow()
			expect(breaker.getStats().state).toBe('OPEN')
		})
	})

	describe('canExecute', () => {
		it('should return true when CLOSED', () => {
			const breaker = new CircuitBreaker()
			expect(breaker.canExecute()).toBe(true)
		})

		it('should return false when OPEN', async () => {
			const breaker = new CircuitBreaker({ failureThreshold: 1 })
			const fn = jest.fn().mockRejectedValue(new Error('failed'))

			await expect(breaker.execute(fn)).rejects.toThrow()

			expect(breaker.canExecute()).toBe(false)
		})

		it('should return true when HALF_OPEN', async () => {
			const breaker = new CircuitBreaker({
				failureThreshold: 1,
				resetTimeoutMs: 10
			})
			const fn = jest.fn().mockRejectedValue(new Error('failed'))

			await expect(breaker.execute(fn)).rejects.toThrow()
			await new Promise((resolve) => setTimeout(resolve, 20))

			expect(breaker.canExecute()).toBe(true)
		})
	})

	describe('reset', () => {
		it('should reset to CLOSED state', async () => {
			const breaker = new CircuitBreaker({ failureThreshold: 1 })
			const fn = jest.fn().mockRejectedValue(new Error('failed'))

			await expect(breaker.execute(fn)).rejects.toThrow()
			expect(breaker.getStats().state).toBe('OPEN')

			breaker.reset()

			expect(breaker.getStats().state).toBe('CLOSED')
			expect(breaker.getStats().failures).toBe(0)
			expect(breaker.getStats().successes).toBe(0)
		})
	})

	describe('feature flag integration', () => {
		it('should never trip when CIRCUIT_BREAKER_ENABLED is false', async () => {
			setPerformanceConfig(
				createTestConfig({
					CIRCUIT_BREAKER_ENABLED: false
				})
			)

			const breaker = new CircuitBreaker({ failureThreshold: 1 })
			const fn = jest.fn().mockRejectedValue(new Error('failed'))

			// Fail many times
			for (let i = 0; i < 10; i++) {
				await expect(breaker.execute(fn)).rejects.toThrow('failed')
			}

			// Should still be CLOSED
			expect(breaker.getStats().state).toBe('CLOSED')
		})

		it('should trip normally when CIRCUIT_BREAKER_ENABLED is true', async () => {
			setPerformanceConfig(
				createTestConfig({
					CIRCUIT_BREAKER_ENABLED: true
				})
			)

			const breaker = new CircuitBreaker({ failureThreshold: 1 })
			const fn = jest.fn().mockRejectedValue(new Error('failed'))

			await expect(breaker.execute(fn)).rejects.toThrow()

			expect(breaker.getStats().state).toBe('OPEN')
		})
	})

	describe('global instance', () => {
		it('should return same instance from getAudibleCircuitBreaker', () => {
			const breaker1 = getAudibleCircuitBreaker()
			const breaker2 = getAudibleCircuitBreaker()

			expect(breaker1).toBe(breaker2)
		})

		it('should create new instance after reset', () => {
			const breaker1 = getAudibleCircuitBreaker()
			resetAudibleCircuitBreaker()
			const breaker2 = getAudibleCircuitBreaker()

			expect(breaker1).not.toBe(breaker2)
		})
	})

	describe('timing', () => {
		it('should track last failure time', async () => {
			const before = Date.now()
			const breaker = new CircuitBreaker({ failureThreshold: 1 })
			const fn = jest.fn().mockRejectedValue(new Error('failed'))

			await expect(breaker.execute(fn)).rejects.toThrow()

			const stats = breaker.getStats()
			expect(stats.lastFailureTime).toBeGreaterThanOrEqual(before)
			expect(stats.lastFailureTime).toBeLessThanOrEqual(Date.now())
		})

		it('should track last success time', async () => {
			const before = Date.now()
			const breaker = new CircuitBreaker()
			const fn = jest.fn().mockResolvedValue('success')

			await breaker.execute(fn)

			const stats = breaker.getStats()
			expect(stats.lastSuccessTime).toBeGreaterThanOrEqual(before)
			expect(stats.lastSuccessTime).toBeLessThanOrEqual(Date.now())
		})
	})
})
