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

		it('should use default 5 for SCHEDULER_MAX_PER_REGION when not set', () => {
			delete process.env.SCHEDULER_MAX_PER_REGION
			const config = createPerformanceConfig()
			expect(config.SCHEDULER_MAX_PER_REGION).toBe(5)
		})

		it('should use default "us" for DEFAULT_REGION when not set', () => {
			delete process.env.DEFAULT_REGION
			const config = createPerformanceConfig()
			expect(config.DEFAULT_REGION).toBe('us')
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

		it('should override SCHEDULER_MAX_PER_REGION from environment', () => {
			process.env.SCHEDULER_MAX_PER_REGION = '10'
			const config = createPerformanceConfig()
			expect(config.SCHEDULER_MAX_PER_REGION).toBe(10)
		})

		it('should override DEFAULT_REGION from environment', () => {
			process.env.DEFAULT_REGION = 'uk'
			const config = createPerformanceConfig()
			expect(config.DEFAULT_REGION).toBe('uk')
		})

		it('should handle all environment variables at once', () => {
			process.env.USE_PARALLEL_SCHEDULER = 'true'
			process.env.USE_CONNECTION_POOLING = 'false'
			process.env.USE_COMPACT_JSON = 'false'
			process.env.USE_SORTED_KEYS = 'true'
			process.env.CIRCUIT_BREAKER_ENABLED = 'false'
			process.env.MAX_CONCURRENT_REQUESTS = '75'
			process.env.SCHEDULER_CONCURRENCY = '8'
			process.env.SCHEDULER_MAX_PER_REGION = '12'
			process.env.DEFAULT_REGION = 'uk'

			const config = createPerformanceConfig()

			expect(config.USE_PARALLEL_SCHEDULER).toBe(true)
			expect(config.USE_CONNECTION_POOLING).toBe(false)
			expect(config.USE_COMPACT_JSON).toBe(false)
			expect(config.USE_SORTED_KEYS).toBe(true)
			expect(config.CIRCUIT_BREAKER_ENABLED).toBe(false)
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(75)
			expect(config.SCHEDULER_CONCURRENCY).toBe(8)
			expect(config.SCHEDULER_MAX_PER_REGION).toBe(12)
			expect(config.DEFAULT_REGION).toBe('uk')
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

	describe('String Parsing', () => {
		it('should trim whitespace from DEFAULT_REGION', () => {
			process.env.DEFAULT_REGION = '  uk  '
			const config = createPerformanceConfig()
			expect(config.DEFAULT_REGION).toBe('uk')
		})

		it('should trim whitespace from DEFAULT_REGION with multiple spaces', () => {
			process.env.DEFAULT_REGION = '    uk    '
			const config = createPerformanceConfig()
			expect(config.DEFAULT_REGION).toBe('uk')
		})

		it('should handle DEFAULT_REGION without whitespace', () => {
			process.env.DEFAULT_REGION = 'uk'
			const config = createPerformanceConfig()
			expect(config.DEFAULT_REGION).toBe('uk')
		})

		it('should handle DEFAULT_REGION with tab whitespace', () => {
			process.env.DEFAULT_REGION = '\tuk\t'
			const config = createPerformanceConfig()
			expect(config.DEFAULT_REGION).toBe('uk')
		})
	})

	describe('Invalid Numeric Fallback', () => {
		it('should fallback to 50 for MAX_CONCURRENT_REQUESTS with non-numeric string "abc"', () => {
			jest.resetModules()
			process.env.MAX_CONCURRENT_REQUESTS = 'abc'
			const { createPerformanceConfig: createConfig } = jest.requireActual('#config/performance')
			const config = createConfig()
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(50)
		})

		it('should fallback to 50 for MAX_CONCURRENT_REQUESTS with non-numeric string "invalid"', () => {
			jest.resetModules()
			process.env.MAX_CONCURRENT_REQUESTS = 'invalid'
			const { createPerformanceConfig: createConfig } = jest.requireActual('#config/performance')
			const config = createConfig()
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(50)
		})

		it('should fallback to 50 for MAX_CONCURRENT_REQUESTS with negative string "-1"', () => {
			jest.resetModules()
			process.env.MAX_CONCURRENT_REQUESTS = '-1'
			const { createPerformanceConfig: createConfig } = jest.requireActual('#config/performance')
			const config = createConfig()
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(50)
		})

		it('should fallback to 50 for MAX_CONCURRENT_REQUESTS with negative string "-100"', () => {
			jest.resetModules()
			process.env.MAX_CONCURRENT_REQUESTS = '-100'
			const { createPerformanceConfig: createConfig } = jest.requireActual('#config/performance')
			const config = createConfig()
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(50)
		})

		it('should fallback to 50 for MAX_CONCURRENT_REQUESTS with zero "0"', () => {
			jest.resetModules()
			process.env.MAX_CONCURRENT_REQUESTS = '0'
			const { createPerformanceConfig: createConfig } = jest.requireActual('#config/performance')
			const config = createConfig()
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(50)
		})

		it('should fallback to 5 for SCHEDULER_CONCURRENCY with non-numeric string "xyz"', () => {
			jest.resetModules()
			process.env.SCHEDULER_CONCURRENCY = 'xyz'
			const { createPerformanceConfig: createConfig } = jest.requireActual('#config/performance')
			const config = createConfig()
			expect(config.SCHEDULER_CONCURRENCY).toBe(5)
		})

		it('should fallback to 5 for SCHEDULER_CONCURRENCY with non-numeric string "not-a-number"', () => {
			jest.resetModules()
			process.env.SCHEDULER_CONCURRENCY = 'not-a-number'
			const { createPerformanceConfig: createConfig } = jest.requireActual('#config/performance')
			const config = createConfig()
			expect(config.SCHEDULER_CONCURRENCY).toBe(5)
		})

		it('should fallback to 5 for SCHEDULER_CONCURRENCY with negative string "-5"', () => {
			jest.resetModules()
			process.env.SCHEDULER_CONCURRENCY = '-5'
			const { createPerformanceConfig: createConfig } = jest.requireActual('#config/performance')
			const config = createConfig()
			expect(config.SCHEDULER_CONCURRENCY).toBe(5)
		})

		it('should fallback to 5 for SCHEDULER_CONCURRENCY with negative string "-10"', () => {
			jest.resetModules()
			process.env.SCHEDULER_CONCURRENCY = '-10'
			const { createPerformanceConfig: createConfig } = jest.requireActual('#config/performance')
			const config = createConfig()
			expect(config.SCHEDULER_CONCURRENCY).toBe(5)
		})

		it('should fallback to 5 for SCHEDULER_CONCURRENCY with zero "0"', () => {
			jest.resetModules()
			process.env.SCHEDULER_CONCURRENCY = '0'
			const { createPerformanceConfig: createConfig } = jest.requireActual('#config/performance')
			const config = createConfig()
			expect(config.SCHEDULER_CONCURRENCY).toBe(5)
		})

		it('should fallback to 5 for SCHEDULER_MAX_PER_REGION with non-numeric string "abc"', () => {
			jest.resetModules()
			process.env.SCHEDULER_MAX_PER_REGION = 'abc'
			const { createPerformanceConfig: createConfig } = jest.requireActual('#config/performance')
			const config = createConfig()
			expect(config.SCHEDULER_MAX_PER_REGION).toBe(5)
		})

		it('should fallback to 5 for SCHEDULER_MAX_PER_REGION with non-numeric string "invalid"', () => {
			jest.resetModules()
			process.env.SCHEDULER_MAX_PER_REGION = 'invalid'
			const { createPerformanceConfig: createConfig } = jest.requireActual('#config/performance')
			const config = createConfig()
			expect(config.SCHEDULER_MAX_PER_REGION).toBe(5)
		})

		it('should fallback to 5 for SCHEDULER_MAX_PER_REGION with negative string "-1"', () => {
			jest.resetModules()
			process.env.SCHEDULER_MAX_PER_REGION = '-1'
			const { createPerformanceConfig: createConfig } = jest.requireActual('#config/performance')
			const config = createConfig()
			expect(config.SCHEDULER_MAX_PER_REGION).toBe(5)
		})

		it('should fallback to 5 for SCHEDULER_MAX_PER_REGION with negative string "-10"', () => {
			jest.resetModules()
			process.env.SCHEDULER_MAX_PER_REGION = '-10'
			const { createPerformanceConfig: createConfig } = jest.requireActual('#config/performance')
			const config = createConfig()
			expect(config.SCHEDULER_MAX_PER_REGION).toBe(5)
		})

		it('should fallback to 5 for SCHEDULER_MAX_PER_REGION with zero "0"', () => {
			jest.resetModules()
			process.env.SCHEDULER_MAX_PER_REGION = '0'
			const { createPerformanceConfig: createConfig } = jest.requireActual('#config/performance')
			const config = createConfig()
			expect(config.SCHEDULER_MAX_PER_REGION).toBe(5)
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
				SCHEDULER_CONCURRENCY: 10,
				SCHEDULER_MAX_PER_REGION: 10,
				DEFAULT_REGION: 'uk'
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
			expect(config.SCHEDULER_MAX_PER_REGION).toBe(10)
			expect(config.DEFAULT_REGION).toBe('uk')
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
				SCHEDULER_CONCURRENCY: 5,
				SCHEDULER_MAX_PER_REGION: 5,
				DEFAULT_REGION: 'us'
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
			expect(DEFAULT_PERFORMANCE_CONFIG.SCHEDULER_MAX_PER_REGION).toBe(5)
			expect(DEFAULT_PERFORMANCE_CONFIG.DEFAULT_REGION).toBe('us')
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
				'SCHEDULER_CONCURRENCY',
				'SCHEDULER_MAX_PER_REGION',
				'DEFAULT_REGION'
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
			expect(typeof config.SCHEDULER_MAX_PER_REGION).toBe('number')
			expect(typeof config.DEFAULT_REGION).toBe('string')
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
			delete process.env.SCHEDULER_MAX_PER_REGION
			delete process.env.DEFAULT_REGION

			const config = createPerformanceConfig()

			expect(config.USE_PARALLEL_SCHEDULER).toBe(false)
			expect(config.USE_CONNECTION_POOLING).toBe(true)
			expect(config.USE_COMPACT_JSON).toBe(true)
			expect(config.USE_SORTED_KEYS).toBe(false)
			expect(config.CIRCUIT_BREAKER_ENABLED).toBe(true)
			expect(config.MAX_CONCURRENT_REQUESTS).toBe(50)
			expect(config.SCHEDULER_CONCURRENCY).toBe(5)
			expect(config.SCHEDULER_MAX_PER_REGION).toBe(5)
			expect(config.DEFAULT_REGION).toBe('us')
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
