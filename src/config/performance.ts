/**
 * Performance Feature Flags Configuration
 *
 * Environment-based feature flags to enable gradual rollout of high-risk changes.
 * All flags support environment variable overrides with sensible defaults.
 *
 * Boolean parsing supports: true, True, TRUE, 1 (case-insensitive)
 */

import { z } from 'zod'

// ============================================================================
// Boolean Parsing Utility
// ============================================================================

/**
 * Parse boolean from environment variable string.
 * Supports: true, True, TRUE, 1 (case-insensitive)
 * Returns undefined if value is not set, allowing defaults to take effect.
 */
function parseBoolean(value: string | undefined): boolean | undefined {
	if (value === undefined) return undefined
	const normalized = value.toLowerCase().trim()
	return normalized === 'true' || normalized === '1'
}

// ============================================================================
// Feature Flag Schemas
// ============================================================================

export const PerformanceConfigSchema = z.object({
	/** Enable parallel UpdateScheduler - HIGH RISK, requires feature flag */
	USE_PARALLEL_SCHEDULER: z.boolean().default(false),

	/** Enable HTTP connection pooling for API calls */
	USE_CONNECTION_POOLING: z.boolean().default(true),

	/** Use compact JSON format in Redis (no pretty-printing) */
	USE_COMPACT_JSON: z.boolean().default(true),

	/** Sort object keys in responses - adds O(n log n) overhead */
	USE_SORTED_KEYS: z.boolean().default(false),

	/** Enable circuit breaker pattern for external API calls */
	CIRCUIT_BREAKER_ENABLED: z.boolean().default(true),

	/** Enable performance metrics collection and /metrics endpoint */
	METRICS_ENABLED: z.boolean().default(true),

	/** HTTP connection pool size - max concurrent connections */
	MAX_CONCURRENT_REQUESTS: z.number().int().positive().default(50),

	/** Max concurrent scheduler operations */
	SCHEDULER_CONCURRENCY: z.number().int().positive().default(5)
})

export type PerformanceConfig = z.infer<typeof PerformanceConfigSchema>

// ============================================================================
// Configuration Factory
// ============================================================================

/**
 * Create performance configuration from environment variables.
 * Falls back to sensible defaults when env vars are not set.
 */
export function createPerformanceConfig(): PerformanceConfig {
	// Parse numeric values with NaN validation
	const maxConcurrentRequests = process.env.MAX_CONCURRENT_REQUESTS
		? parseInt(process.env.MAX_CONCURRENT_REQUESTS, 10)
		: 50
	const schedulerConcurrency = process.env.SCHEDULER_CONCURRENCY
		? parseInt(process.env.SCHEDULER_CONCURRENCY, 10)
		: 5

	// Validate numeric values are finite and positive before using
	const validatedMaxConcurrent =
		!Number.isNaN(maxConcurrentRequests) &&
		Number.isFinite(maxConcurrentRequests) &&
		maxConcurrentRequests > 0
			? maxConcurrentRequests
			: 50
	const validatedSchedulerConcurrency =
		!Number.isNaN(schedulerConcurrency) &&
		Number.isFinite(schedulerConcurrency) &&
		schedulerConcurrency > 0
			? schedulerConcurrency
			: 5

	return PerformanceConfigSchema.parse({
		USE_PARALLEL_SCHEDULER: parseBoolean(process.env.USE_PARALLEL_SCHEDULER) ?? false,
		USE_CONNECTION_POOLING: parseBoolean(process.env.USE_CONNECTION_POOLING) ?? true,
		USE_COMPACT_JSON: parseBoolean(process.env.USE_COMPACT_JSON) ?? true,
		USE_SORTED_KEYS: parseBoolean(process.env.USE_SORTED_KEYS) ?? false,
		CIRCUIT_BREAKER_ENABLED: parseBoolean(process.env.CIRCUIT_BREAKER_ENABLED) ?? true,
		METRICS_ENABLED: parseBoolean(process.env.METRICS_ENABLED) ?? true,
		MAX_CONCURRENT_REQUESTS: validatedMaxConcurrent,
		SCHEDULER_CONCURRENCY: validatedSchedulerConcurrency
	})
}

// ============================================================================
// Default Configuration (Documented)
// ============================================================================

/**
 * Default feature flag values for documentation purposes.
 * These are the values used when environment variables are not set.
 */
export const DEFAULT_PERFORMANCE_CONFIG: Readonly<PerformanceConfig> = {
	USE_PARALLEL_SCHEDULER: false,
	USE_CONNECTION_POOLING: true,
	USE_COMPACT_JSON: true,
	USE_SORTED_KEYS: false,
	CIRCUIT_BREAKER_ENABLED: true,
	METRICS_ENABLED: true,
	MAX_CONCURRENT_REQUESTS: 50,
	SCHEDULER_CONCURRENCY: 5
} as const

// ============================================================================
// Singleton Instance
// ============================================================================

let _config: PerformanceConfig | null = null

/**
 * Get the performance configuration instance.
 * Creates the instance on first call.
 */
export function getPerformanceConfig(): PerformanceConfig {
	if (_config === null) {
		_config = createPerformanceConfig()
	}
	return _config
}

/**
 * Reset the configuration instance (useful for testing).
 */
export function resetPerformanceConfig(): void {
	_config = null
}

/**
 * Set a custom configuration instance (useful for testing).
 */
export function setPerformanceConfig(config: PerformanceConfig): void {
	_config = config
}
