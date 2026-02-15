import {
	createPerformanceConfig,
	DEFAULT_PERFORMANCE_CONFIG,
	getPerformanceConfig,
	PerformanceConfig,
	resetPerformanceConfig,
	setPerformanceConfig
} from '#config/performance'

describe('PerformanceConfig', () => {
	const originalEnv = process.env

	beforeEach(() => {
		// Save original env
		process.env = { ...originalEnv }
		resetPerformanceConfig()
	})

	afterEach(() => {
		// Restore original env
		process.env = originalEnv
		resetPerformanceConfig()
	})

	describe('Boolean Parsing', () => {
		it('should parse "true" as true', () => {
			process.env.USE_PARALLEL_SCHEDULER = 'true'
			const config = createPerformanceConfig()
			expect(config.USE_PARALLEL_SCHEDULER).toBe(true)
		})

		it('should parse "True" as true', () => {
			process.env.USE_PARALLEL_SCHEDULER = 'True'
			const config = createPerformanceConfig()
			expect(config.USE_PARALLEL_SCHEDULER).toBe(true)
		})

		it('should parse "TRUE" as true', () => {
			process.env.USE_PARALLEL_SCHEDULER = 'TRUE'
			const config = createPerformanceConfig()
			expect(config.USE_PARALLEL_SCHEDULER).toBe(true)
		})

		it('should parse "1" as true', () => {
			process.env.USE_PARALLEL_SCHEDULER = '1'
			const config = createPerformanceConfig()
			expect(config.USE_PARALLEL_SCHEDULER).toBe(true)
		})

		it('should parse "false" as false', () => {
			process.env.USE_PARALLEL_SCHEDULER = 'false'
			const config = createPerformanceConfig()
			expect(config.USE_PARALLEL_SCHEDULER).toBe(false)
		})

		it('should parse "False" as false', () => {
			process.env.USE_PARALLEL_SCHEDULER = 'False'
			const config = createPerformanceConfig()
			expect(config.USE_PARALLEL_SCHEDULER).toBe(false)
		})

		it('should parse "FALSE" as false', () => {
			process.env.USE_PARALLEL_SCHEDULER = 'FALSE'
			const config = createPerformanceConfig()
			expect(config.USE_PARALLEL_SCHEDULER).toBe(false)
		})

		it('should parse "0" as false', () => {
			process.env.USE_PARALLEL_SCHEDULER = '0'
			const config = createPerformanceConfig()
			expect(config.USE_PARALLEL_SCHEDULER).toBe(false)
		})

		it('should parse unknown values as false', () => {
			process.env.USE_PARALLEL_SCHEDULER = 'maybe'
			const config = createPerformanceConfig()
			expect(config.USE_PARALLEL_SCHEDULER).toBe(false)
		})

		it('should parse empty string as false', () => {
			process.env.USE_PARALLEL_SCHEDULER = ''
			const config = createPerformanceConfig()
			expect(config.USE_PARALLEL_SCHEDULER).toBe(false)
		})

		it('should parse whitespace around value', () => {
			process.env.USE_PARALLEL_SCHEDULER = '  true  '
			const config = createPerformanceConfig()
			expect(config.USE_PARALLEL_SCHEDULER).toBe(true)
		})
	})

	describe('METRICS_ENABLED Parsing', () => {
		it('should parse "true" as true', () => {
			process.env.METRICS_ENABLED = 'true'
			const config = createPerformanceConfig()
			expect(config.METRICS_ENABLED).toBe(true)
		})

		it('should parse "false" as false', () => {
			process.env.METRICS_ENABLED = 'false'
			const config = createPerformanceConfig()
			expect(config.METRICS_ENABLED).toBe(false)
		})
	})

	describe('Default Values', () => {
		it('should use default false for USE_PARALLEL_SCHEDULER when not set', () => {
			delete process.env.USE_PARALLEL_SCHEDULER
			const config = createPerformanceConfig()
			expect(config.USE_PARALLEL_SCHEDULER).toBe(false)
		})

		it('should use default true for USE_CONNECTION_POOLING when not set', () => {
			delete process.env.USE_CONNECTION_POOLING
			const config = createPerformanceConfig()
			expect(config.USE_CONNECTION_POOLING).toBe(true)
		})

		it('should use default true for USE_COMPACT_JSON when not set', () => {
			delete process.env.USE_COMPACT_JSON
			const config = createPerformanceConfig()
			expect(config.USE_COMPACT_JSON).toBe(true)
		})

		it('should use default false for USE_SORTED_KEYS when not set', () => {
			delete process.env.USE_SORTED_KEYS
			const config = createPerformanceConfig()
			expect(config.USE_SORTED_KEYS).toBe(false)
		})

		it('should use default true for CIRCUIT_BREAKER_ENABLED when not set', () => {
			delete process.env.CIRCUIT_BREAKER_ENABLED
			const config = createPerformanceConfig()
			expect(config.CIRCUIT_BREAKER_ENABLED).toBe(true)
		})

		it('should use default true for METRICS_ENABLED when not set', () => {
			delete process.env.METRICS_ENABLED
			const config = createPerformanceConfig()
			expect(config.METRICS_ENABLED).toBe(DEFAULT_PERFORMANCE_CONFIG.METRICS_ENABLED)
		})

		it('should use default 50 for MAX_CONCURRENT_REQUESTS when not set', () => {
			delete process.env.MAX_CONCURRENT_REQUESTS
			const config = createPerformanceConfig()
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(50)
		})

		it('should use default 5 for SCHEDULER_CONCURRENCY when not set', () => {
			delete process.env.SCHEDULER_CONCURRENCY
			const config = createPerformanceConfig()
			expect(config.SCHEDULER_CONCURRENCY).toBe(5)
		})
	})

	describe('Environment Variable Overrides', () => {
		it('should override USE_PARALLEL_SCHEDULER from environment', () => {
			process.env.USE_PARALLEL_SCHEDULER = 'true'
			const config = createPerformanceConfig()
			expect(config.USE_PARALLEL_SCHEDULER).toBe(true)
		})

		it('should override USE_CONNECTION_POOLING from environment', () => {
			process.env.USE_CONNECTION_POOLING = 'false'
			const config = createPerformanceConfig()
			expect(config.USE_CONNECTION_POOLING).toBe(false)
		})

		it('should override USE_COMPACT_JSON from environment', () => {
			process.env.USE_COMPACT_JSON = 'false'
			const config = createPerformanceConfig()
			expect(config.USE_COMPACT_JSON).toBe(false)
		})

		it('should override USE_SORTED_KEYS from environment', () => {
			process.env.USE_SORTED_KEYS = 'true'
			const config = createPerformanceConfig()
			expect(config.USE_SORTED_KEYS).toBe(true)
		})

		it('should override CIRCUIT_BREAKER_ENABLED from environment', () => {
			process.env.CIRCUIT_BREAKER_ENABLED = 'false'
			const config = createPerformanceConfig()
			expect(config.CIRCUIT_BREAKER_ENABLED).toBe(false)
		})

		it('should override MAX_CONCURRENT_REQUESTS from environment', () => {
			process.env.MAX_CONCURRENT_REQUESTS = '100'
			const config = createPerformanceConfig()
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(100)
		})

		it('should override SCHEDULER_CONCURRENCY from environment', () => {
			process.env.SCHEDULER_CONCURRENCY = '10'
			const config = createPerformanceConfig()
			expect(config.SCHEDULER_CONCURRENCY).toBe(10)
		})

		it('should handle all environment variables at once', () => {
			process.env.USE_PARALLEL_SCHEDULER = 'true'
			process.env.USE_CONNECTION_POOLING = 'false'
			process.env.USE_COMPACT_JSON = 'false'
			process.env.USE_SORTED_KEYS = 'true'
			process.env.CIRCUIT_BREAKER_ENABLED = 'false'
			process.env.MAX_CONCURRENT_REQUESTS = '75'
			process.env.SCHEDULER_CONCURRENCY = '8'

			const config = createPerformanceConfig()

			expect(config.USE_PARALLEL_SCHEDULER).toBe(true)
			expect(config.USE_CONNECTION_POOLING).toBe(false)
			expect(config.USE_COMPACT_JSON).toBe(false)
			expect(config.USE_SORTED_KEYS).toBe(true)
			expect(config.CIRCUIT_BREAKER_ENABLED).toBe(false)
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(75)
			expect(config.SCHEDULER_CONCURRENCY).toBe(8)
		})
	})

	describe('Numeric Parsing', () => {
		it('should parse numeric string for MAX_CONCURRENT_REQUESTS', () => {
			process.env.MAX_CONCURRENT_REQUESTS = '25'
			const config = createPerformanceConfig()
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(25)
		})

		it('should parse numeric string for SCHEDULER_CONCURRENCY', () => {
			process.env.SCHEDULER_CONCURRENCY = '3'
			const config = createPerformanceConfig()
			expect(config.SCHEDULER_CONCURRENCY).toBe(3)
		})

		it('should handle large numeric values', () => {
			process.env.MAX_CONCURRENT_REQUESTS = '500'
			const config = createPerformanceConfig()
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(500)
		})
	})

	describe('Invalid Numeric Fallback', () => {
		it('should fallback to 50 for MAX_CONCURRENT_REQUESTS with non-numeric string "abc"', () => {
			process.env.MAX_CONCURRENT_REQUESTS = 'abc'
			resetPerformanceConfig()
			const config = createPerformanceConfig()
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(50)
		})

		it('should fallback to 50 for MAX_CONCURRENT_REQUESTS with non-numeric string "invalid"', () => {
			process.env.MAX_CONCURRENT_REQUESTS = 'invalid'
			resetPerformanceConfig()
			const config = createPerformanceConfig()
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(50)
		})

		it('should fallback to 50 for MAX_CONCURRENT_REQUESTS with negative string "-1"', () => {
			process.env.MAX_CONCURRENT_REQUESTS = '-1'
			resetPerformanceConfig()
			const config = createPerformanceConfig()
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(50)
		})

		it('should fallback to 50 for MAX_CONCURRENT_REQUESTS with negative string "-100"', () => {
			process.env.MAX_CONCURRENT_REQUESTS = '-100'
			resetPerformanceConfig()
			const config = createPerformanceConfig()
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(50)
		})

		it('should fallback to 50 for MAX_CONCURRENT_REQUESTS with zero "0"', () => {
			process.env.MAX_CONCURRENT_REQUESTS = '0'
			resetPerformanceConfig()
			const config = createPerformanceConfig()
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(50)
		})

		it('should fallback to 5 for SCHEDULER_CONCURRENCY with non-numeric string "xyz"', () => {
			process.env.SCHEDULER_CONCURRENCY = 'xyz'
			resetPerformanceConfig()
			const config = createPerformanceConfig()
			expect(config.SCHEDULER_CONCURRENCY).toBe(5)
		})

		it('should fallback to 5 for SCHEDULER_CONCURRENCY with non-numeric string "not-a-number"', () => {
			process.env.SCHEDULER_CONCURRENCY = 'not-a-number'
			resetPerformanceConfig()
			const config = createPerformanceConfig()
			expect(config.SCHEDULER_CONCURRENCY).toBe(5)
		})

		it('should fallback to 5 for SCHEDULER_CONCURRENCY with negative string "-5"', () => {
			process.env.SCHEDULER_CONCURRENCY = '-5'
			resetPerformanceConfig()
			const config = createPerformanceConfig()
			expect(config.SCHEDULER_CONCURRENCY).toBe(5)
		})

		it('should fallback to 5 for SCHEDULER_CONCURRENCY with negative string "-10"', () => {
			process.env.SCHEDULER_CONCURRENCY = '-10'
			resetPerformanceConfig()
			const config = createPerformanceConfig()
			expect(config.SCHEDULER_CONCURRENCY).toBe(5)
		})

		it('should fallback to 5 for SCHEDULER_CONCURRENCY with zero "0"', () => {
			process.env.SCHEDULER_CONCURRENCY = '0'
			resetPerformanceConfig()
			const config = createPerformanceConfig()
			expect(config.SCHEDULER_CONCURRENCY).toBe(5)
		})
	})

	describe('Singleton Pattern', () => {
		it('should return same instance from getPerformanceConfig', () => {
			const config1 = getPerformanceConfig()
			const config2 = getPerformanceConfig()
			expect(config1).toBe(config2)
		})

		it('should reset configuration with resetPerformanceConfig', () => {
			process.env.USE_PARALLEL_SCHEDULER = 'true'
			const config1 = getPerformanceConfig()
			expect(config1.USE_PARALLEL_SCHEDULER).toBe(true)

			resetPerformanceConfig()
			delete process.env.USE_PARALLEL_SCHEDULER
			const config2 = getPerformanceConfig()
			expect(config2.USE_PARALLEL_SCHEDULER).toBe(false)
		})

		it('should set custom configuration with setPerformanceConfig', () => {
			const customConfig: PerformanceConfig = {
				USE_PARALLEL_SCHEDULER: true,
				USE_CONNECTION_POOLING: false,
				USE_COMPACT_JSON: false,
				USE_SORTED_KEYS: true,
				CIRCUIT_BREAKER_ENABLED: false,
				METRICS_ENABLED: false,
				MAX_CONCURRENT_REQUESTS: 100,
				SCHEDULER_CONCURRENCY: 10
			}

			setPerformanceConfig(customConfig)
			const config = getPerformanceConfig()

			expect(config.USE_PARALLEL_SCHEDULER).toBe(true)
			expect(config.USE_CONNECTION_POOLING).toBe(false)
			expect(config.USE_COMPACT_JSON).toBe(false)
			expect(config.USE_SORTED_KEYS).toBe(true)
			expect(config.CIRCUIT_BREAKER_ENABLED).toBe(false)
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(100)
			expect(config.SCHEDULER_CONCURRENCY).toBe(10)
		})

		it('should allow overriding singleton with environment after reset', () => {
			const customConfig: PerformanceConfig = {
				USE_PARALLEL_SCHEDULER: true,
				USE_CONNECTION_POOLING: true,
				USE_COMPACT_JSON: true,
				USE_SORTED_KEYS: false,
				CIRCUIT_BREAKER_ENABLED: true,
				METRICS_ENABLED: true,
				MAX_CONCURRENT_REQUESTS: 50,
				SCHEDULER_CONCURRENCY: 5
			}

			setPerformanceConfig(customConfig)
			resetPerformanceConfig()

			process.env.USE_PARALLEL_SCHEDULER = 'true'
			process.env.MAX_CONCURRENT_REQUESTS = '200'

			const config = getPerformanceConfig()

			expect(config.USE_PARALLEL_SCHEDULER).toBe(true)
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(200)
		})
	})

	describe('Default Configuration Documentation', () => {
		it('should match documented defaults', () => {
			expect(DEFAULT_PERFORMANCE_CONFIG.USE_PARALLEL_SCHEDULER).toBe(false)
			expect(DEFAULT_PERFORMANCE_CONFIG.USE_CONNECTION_POOLING).toBe(true)
			expect(DEFAULT_PERFORMANCE_CONFIG.USE_COMPACT_JSON).toBe(true)
			expect(DEFAULT_PERFORMANCE_CONFIG.USE_SORTED_KEYS).toBe(false)
			expect(DEFAULT_PERFORMANCE_CONFIG.CIRCUIT_BREAKER_ENABLED).toBe(true)
			expect(DEFAULT_PERFORMANCE_CONFIG.MAX_CONCURRENT_REQUESTS).toBe(50)
			expect(DEFAULT_PERFORMANCE_CONFIG.SCHEDULER_CONCURRENCY).toBe(5)
		})

		it('should have all required properties', () => {
			const requiredKeys = [
				'USE_PARALLEL_SCHEDULER',
				'USE_CONNECTION_POOLING',
				'USE_COMPACT_JSON',
				'USE_SORTED_KEYS',
				'CIRCUIT_BREAKER_ENABLED',
				'METRICS_ENABLED',
				'MAX_CONCURRENT_REQUESTS',
				'SCHEDULER_CONCURRENCY'
			]

			for (const key of requiredKeys) {
				expect(DEFAULT_PERFORMANCE_CONFIG).toHaveProperty(key)
			}
		})
	})

	describe('Type Safety', () => {
		it('should have correct types for all properties', () => {
			const config = createPerformanceConfig()

			expect(typeof config.USE_PARALLEL_SCHEDULER).toBe('boolean')
			expect(typeof config.USE_CONNECTION_POOLING).toBe('boolean')
			expect(typeof config.USE_COMPACT_JSON).toBe('boolean')
			expect(typeof config.USE_SORTED_KEYS).toBe('boolean')
			expect(typeof config.CIRCUIT_BREAKER_ENABLED).toBe('boolean')
			expect(typeof config.METRICS_ENABLED).toBe('boolean')
			expect(typeof config.MAX_CONCURRENT_REQUESTS).toBe('number')
			expect(typeof config.SCHEDULER_CONCURRENCY).toBe('number')
		})

		it('should return PerformanceConfig type from factory', () => {
			const config = createPerformanceConfig()
			expect(config).toHaveProperty('USE_PARALLEL_SCHEDULER')
			expect(config).toHaveProperty('MAX_CONCURRENT_REQUESTS')
		})
	})

	describe('Edge Cases', () => {
		it('should handle undefined environment variables', () => {
			delete process.env.USE_PARALLEL_SCHEDULER
			delete process.env.USE_CONNECTION_POOLING
			delete process.env.USE_COMPACT_JSON
			delete process.env.USE_SORTED_KEYS
			delete process.env.CIRCUIT_BREAKER_ENABLED
			delete process.env.MAX_CONCURRENT_REQUESTS
			delete process.env.SCHEDULER_CONCURRENCY

			const config = createPerformanceConfig()

			expect(config.USE_PARALLEL_SCHEDULER).toBe(false)
			expect(config.USE_CONNECTION_POOLING).toBe(true)
			expect(config.USE_COMPACT_JSON).toBe(true)
			expect(config.USE_SORTED_KEYS).toBe(false)
			expect(config.CIRCUIT_BREAKER_ENABLED).toBe(true)
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(50)
			expect(config.SCHEDULER_CONCURRENCY).toBe(5)
		})

		it('should handle case variations consistently', () => {
			const cases = ['true', 'True', 'TRUE', '1']
			for (const value of cases) {
				process.env.USE_PARALLEL_SCHEDULER = value
				const config = createPerformanceConfig()
				expect(config.USE_PARALLEL_SCHEDULER).toBe(true)
			}
		})

		it('should handle negative case variations consistently', () => {
			const cases = ['false', 'False', 'FALSE', '0', 'no', 'NO']
			for (const value of cases) {
				process.env.USE_PARALLEL_SCHEDULER = value
				const config = createPerformanceConfig()
				expect(config.USE_PARALLEL_SCHEDULER).toBe(false)
			}
		})
	})
})
