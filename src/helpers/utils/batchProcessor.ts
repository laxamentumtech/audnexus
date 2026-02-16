import pLimit from 'p-limit'

import { getPerformanceConfig } from '#config/performance'

export interface BatchProcessorOptions {
	concurrency?: number
	maxPerRegion?: number
}

export interface BatchProcessSummary {
	total: number
	success: number
	failures: number
	regions: Record<string, number>
	maxConcurrencyObserved: number
}

/**
 * Validate and clamp concurrency value to minimum 1
 */
function validateConcurrency(value: number | undefined): number {
	const num = Number(value)
	if (Number.isNaN(num) || num < 1) {
		return 1
	}
	return num
}

/**
 * Validate concurrency guardrails for batch processing
 * Ensures concurrency values are within configured limits
 *
 * @param concurrencyInput The desired concurrency value
 * @param maxPerRegionInput Optional max per region value
 * @param schedulerConcurrency The maximum allowed scheduler concurrency from config
 * @param maxPerRegionCap The hard cap for per-region concurrency from config
 * @returns Validated and clamped concurrency and maxPerRegion values
 */
function validateConcurrencyGuardrails(
	concurrencyInput: number | undefined,
	maxPerRegionInput: number | undefined,
	schedulerConcurrency: number,
	maxPerRegionCap: number
): { concurrency: number; maxPerRegion: number } {
	const concurrency = validateConcurrency(concurrencyInput ?? schedulerConcurrency)
	if (concurrency > schedulerConcurrency) {
		throw new Error('Concurrency exceeds SCHEDULER_CONCURRENCY guardrail')
	}
	const configuredMaxPerRegion = validateConcurrency(
		maxPerRegionInput ?? Math.min(concurrency, maxPerRegionCap)
	)
	const maxPerRegion = Math.min(configuredMaxPerRegion, maxPerRegionCap)
	if (maxPerRegion > concurrency) {
		throw new Error('Per-region concurrency exceeds overall concurrency guardrail')
	}
	return { concurrency, maxPerRegion }
}

/**
 * Create atomic counters for tracking batch processing statistics
 * Uses closure pattern to maintain async-safe counters
 */
function createAtomicCounters() {
	let successCount = 0
	let failureCount = 0
	const regionCounts: Record<string, number> = {}
	return {
		incrementSuccess(): void {
			successCount += 1
		},
		incrementFailures(): void {
			failureCount += 1
		},
		incrementRegion(region: string): void {
			regionCounts[region] = (regionCounts[region] ?? 0) + 1
		},
		getSuccess(): number {
			return successCount
		},
		getFailures(): number {
			return failureCount
		},
		getRegions(): Record<string, number> {
			return { ...regionCounts }
		}
	}
}

/**
 * Process items in batches with controlled concurrency
 * Uses p-limit for rate limiting and concurrency control
 *
 * @param items Items to process
 * @param processor Function to process each item
 * @param options Configuration options
 * @returns Promise that resolves when all items are processed
 */
export async function processBatch<T, R>(
	items: T[],
	processor: (item: T) => Promise<R>,
	options: BatchProcessorOptions = {}
): Promise<{ results: (R | undefined)[]; summary: BatchProcessSummary }> {
	const config = getPerformanceConfig()
	if (config.SCHEDULER_CONCURRENCY < 1) {
		throw new Error('SCHEDULER_CONCURRENCY must be at least 1')
	}
	const summary: BatchProcessSummary = {
		total: items.length,
		success: 0,
		failures: 0,
		regions: {},
		maxConcurrencyObserved: 0
	}

	// If parallel scheduler is disabled, process sequentially
	if (!config.USE_PARALLEL_SCHEDULER) {
		const results: (R | undefined)[] = []
		for (const item of items) {
			try {
				const result = await processor(item)
				results.push(result)
				summary.success += 1
			} catch {
				results.push(undefined)
				summary.failures += 1
			}
		}
		return { results, summary }
	}

	const { concurrency } = validateConcurrencyGuardrails(
		options.concurrency,
		undefined,
		config.SCHEDULER_CONCURRENCY,
		config.SCHEDULER_MAX_PER_REGION
	)
	const limit = pLimit(concurrency)
	const counters = createConcurrencyCounter()
	const atomicCounters = createAtomicCounters()

	const promises = items.map((item) =>
		limit(async () => {
			const release = counters.track()
			try {
				const result = await processor(item)
				atomicCounters.incrementSuccess()
				return result
			} catch {
				atomicCounters.incrementFailures()
				return undefined
			} finally {
				release()
			}
		})
	)

	const resolved = await Promise.all(promises)
	const observed = counters.getMax()
	summary.success = atomicCounters.getSuccess()
	summary.failures = atomicCounters.getFailures()
	summary.maxConcurrencyObserved = observed
	return { results: resolved, summary }
}

/**
 * Process items grouped by region with per-region concurrency limits
 * Ensures rate limiting compliance by controlling concurrent requests per region
 *
 * @param items Items with region information
 * @param processor Function to process each item
 * @param options Configuration options
 * @returns Promise that resolves when all items are processed
 */
export async function processBatchByRegion<T extends { region?: string | null }, R>(
	items: T[],
	processor: (item: T) => Promise<R>,
	options: BatchProcessorOptions = {}
): Promise<{ results: (R | undefined)[]; summary: BatchProcessSummary }> {
	const config = getPerformanceConfig()
	if (config.SCHEDULER_CONCURRENCY < 1) {
		throw new Error('SCHEDULER_CONCURRENCY must be at least 1')
	}
	const summary: BatchProcessSummary = {
		total: items.length,
		success: 0,
		failures: 0,
		regions: {},
		maxConcurrencyObserved: 0
	}

	// If parallel scheduler is disabled, process sequentially
	if (!config.USE_PARALLEL_SCHEDULER) {
		const results: (R | undefined)[] = []
		for (const item of items) {
			const region = normalizeRegion(item.region)
			summary.regions[region] = (summary.regions[region] ?? 0) + 1
			try {
				const result = await processor(item)
				results.push(result)
				summary.success += 1
			} catch {
				results.push(undefined)
				summary.failures += 1
			}
		}
		return { results, summary }
	}

	const { concurrency, maxPerRegion } = validateConcurrencyGuardrails(
		options.concurrency,
		options.maxPerRegion,
		config.SCHEDULER_CONCURRENCY,
		config.SCHEDULER_MAX_PER_REGION
	)

	const regionLimiters = new Map<string, ReturnType<typeof pLimit>>()
	const counters = createConcurrencyCounter()
	const atomicCounters = createAtomicCounters()

	const overallLimit = pLimit(concurrency)
	const tasks = items.map((item) => {
		const region = normalizeRegion(item.region)
		atomicCounters.incrementRegion(region)
		let limiter = regionLimiters.get(region)
		if (!limiter) {
			limiter = pLimit(maxPerRegion)
			regionLimiters.set(region, limiter)
		}
		const regionLimiter = limiter

		return overallLimit(() =>
			regionLimiter(async () => {
				const release = counters.track()
				try {
					const result = await processor(item)
					atomicCounters.incrementSuccess()
					return result
				} catch {
					atomicCounters.incrementFailures()
					return undefined
				} finally {
					release()
				}
			})
		)
	})

	const resolved = await Promise.all(tasks)
	const observed = counters.getMax()
	summary.maxConcurrencyObserved = observed
	summary.success = atomicCounters.getSuccess()
	summary.failures = atomicCounters.getFailures()
	summary.regions = atomicCounters.getRegions()
	return { results: resolved, summary }
}

export function normalizeRegion(region?: string | null, defaultRegion?: string): string {
	if (!region || region.trim() === '') return defaultRegion ?? getPerformanceConfig().DEFAULT_REGION
	return region
}

function createConcurrencyCounter() {
	let active = 0
	let max = 0
	return {
		track() {
			active += 1
			max = Math.max(max, active)
			return () => {
				active -= 1
			}
		},
		getMax() {
			return max
		}
	}
}
