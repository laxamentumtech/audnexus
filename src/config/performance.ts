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
// Scheduler Batch Size
// ============================================================================

/**
 * Hard upper bound for SCHEDULER_BATCH_SIZE. Keeps memory bounded even when
 * an operator configures an extreme value, and stays within Zod 4's safe
 * integer range so config creation never throws.
 */
const MAX_SCHEDULER_BATCH_SIZE = 10000

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
	METRICS_ENABLED: z.boolean().default(false),

	/** HTTP connection pool size - max concurrent connections */
	MAX_CONCURRENT_REQUESTS: z.number().int().positive().default(50),

	/** Max concurrent scheduler operations */
	SCHEDULER_CONCURRENCY: z.number().int().positive().default(5),

	/** Hard cap for max per-region concurrency in batch processing */
	SCHEDULER_MAX_PER_REGION: z.number().int().positive().default(5),

	/** Documents per batch when paginating over books/authors/chapters */
	SCHEDULER_BATCH_SIZE: z.number().int().positive().max(MAX_SCHEDULER_BATCH_SIZE).default(1000),

	/** Randomized pacing wait range in ms for batch workers (env: "min-max" or bare "max") */
	JITTER_MS: z
		.object({ min: z.number().int().min(0), max: z.number().int().min(0) })
		.refine((range) => range.min <= range.max, {
			message: 'JITTER_MS.min must be <= JITTER_MS.max'
		})
		.default({ min: 0, max: 5000 }),

	/** Default region for batch processing when none specified */
	DEFAULT_REGION: z.string().default('us')
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
	// Parse numeric values with fallbacks
	const maxConcurrentRequests = process.env.MAX_CONCURRENT_REQUESTS
		? parseInt(process.env.MAX_CONCURRENT_REQUESTS, 10)
		: 50
	const schedulerConcurrency = process.env.SCHEDULER_CONCURRENCY
		? parseInt(process.env.SCHEDULER_CONCURRENCY, 10)
		: 5
	const schedulerMaxPerRegion = process.env.SCHEDULER_MAX_PER_REGION
		? parseInt(process.env.SCHEDULER_MAX_PER_REGION, 10)
		: 5
	const schedulerBatchSize = process.env.SCHEDULER_BATCH_SIZE
		? parseInt(process.env.SCHEDULER_BATCH_SIZE, 10)
		: 1000

	// Handle invalid values before passing to Zod
	const validatedMaxConcurrent =
		Number.isNaN(maxConcurrentRequests) ||
		!Number.isFinite(maxConcurrentRequests) ||
		maxConcurrentRequests <= 0
			? 50
			: maxConcurrentRequests
	const validatedSchedulerConcurrency =
		Number.isNaN(schedulerConcurrency) ||
		!Number.isFinite(schedulerConcurrency) ||
		schedulerConcurrency <= 0
			? 5
			: schedulerConcurrency
	const validatedSchedulerMaxPerRegion =
		Number.isNaN(schedulerMaxPerRegion) ||
		!Number.isFinite(schedulerMaxPerRegion) ||
		schedulerMaxPerRegion <= 0
			? 5
			: schedulerMaxPerRegion
	const validatedSchedulerBatchSize =
		Number.isNaN(schedulerBatchSize) ||
		!Number.isFinite(schedulerBatchSize) ||
		schedulerBatchSize <= 0
			? 1000
			: Math.min(schedulerBatchSize, MAX_SCHEDULER_BATCH_SIZE)

	const defaultJitter = { min: 0, max: 5000 }
	const jitterRaw = process.env.JITTER_MS?.trim()
	const jitterMs = (() => {
		if (!jitterRaw) return defaultJitter
		const parts = jitterRaw.split('-').map((part) => part.trim())
		if (parts.length > 2 || !parts.every((part) => /^\d+$/.test(part))) {
			return defaultJitter
		}
		const numbers = parts.map((part) => Number(part))
		if (numbers.some((n) => !Number.isSafeInteger(n))) {
			return defaultJitter
		}
		const min = parts.length === 2 ? numbers[0] : 0
		const max = numbers[numbers.length - 1]
		return min > max ? defaultJitter : { min, max }
	})()

	return PerformanceConfigSchema.parse({
		USE_PARALLEL_SCHEDULER: parseBoolean(process.env.USE_PARALLEL_SCHEDULER) ?? false,
		USE_CONNECTION_POOLING: parseBoolean(process.env.USE_CONNECTION_POOLING) ?? true,
		USE_COMPACT_JSON: parseBoolean(process.env.USE_COMPACT_JSON) ?? true,
		USE_SORTED_KEYS: parseBoolean(process.env.USE_SORTED_KEYS) ?? false,
		CIRCUIT_BREAKER_ENABLED: parseBoolean(process.env.CIRCUIT_BREAKER_ENABLED) ?? true,
		METRICS_ENABLED: parseBoolean(process.env.METRICS_ENABLED) ?? false,
		MAX_CONCURRENT_REQUESTS: validatedMaxConcurrent,
		SCHEDULER_CONCURRENCY: validatedSchedulerConcurrency,
		SCHEDULER_MAX_PER_REGION: validatedSchedulerMaxPerRegion,
		SCHEDULER_BATCH_SIZE: validatedSchedulerBatchSize,
		JITTER_MS: jitterMs,
		DEFAULT_REGION: process.env.DEFAULT_REGION?.trim() || 'us'
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
	METRICS_ENABLED: false,
	MAX_CONCURRENT_REQUESTS: 50,
	SCHEDULER_CONCURRENCY: 5,
	SCHEDULER_MAX_PER_REGION: 5,
	SCHEDULER_BATCH_SIZE: 1000,
	JITTER_MS: { min: 0, max: 5000 },
	DEFAULT_REGION: 'us'
}

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
 * Rejects SCHEDULER_BATCH_SIZE values outside the valid range (a safe
 * positive integer at most MAX_SCHEDULER_BATCH_SIZE); other fields are
 * stored as-is so runtime guardrails (e.g. SCHEDULER_CONCURRENCY >= 1) can
 * raise their own errors.
 */
export function setPerformanceConfig(config: PerformanceConfig): void {
	if (
		!Number.isSafeInteger(config.SCHEDULER_BATCH_SIZE) ||
		config.SCHEDULER_BATCH_SIZE <= 0 ||
		config.SCHEDULER_BATCH_SIZE > MAX_SCHEDULER_BATCH_SIZE
	) {
		throw new Error(
			`SCHEDULER_BATCH_SIZE must be an integer between 1 and ${MAX_SCHEDULER_BATCH_SIZE}`
		)
	}
	_config = config
}
