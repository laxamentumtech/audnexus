import { DEFAULT_PERFORMANCE_CONFIG, type PerformanceConfig } from '#config/performance'

/** Fake REDIS_URL for tests that need one without a live Redis. */
export const TEST_REDIS_URL = 'redis://127.0.0.1:6379'

/** Base PerformanceConfig for tests, with sensible defaults and per-test overrides. */
export const createTestPerformanceConfig = (
	overrides: Partial<PerformanceConfig> = {}
): PerformanceConfig => ({
	...DEFAULT_PERFORMANCE_CONFIG,
	...overrides
})
