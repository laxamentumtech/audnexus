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
		maxConcurrencyObserved: 1
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

	const concurrency = validateConcurrency(options.concurrency ?? config.SCHEDULER_CONCURRENCY)
	if (concurrency > config.SCHEDULER_CONCURRENCY) {
		throw new Error('Concurrency exceeds SCHEDULER_CONCURRENCY guardrail')
	}
	const limit = pLimit(concurrency)
	const counters = createConcurrencyCounter()

	const promises = items.map((item) =>
		limit(async () => {
			const release = counters.track()
			try {
				const result = await processor(item)
				summary.success += 1
				return result
			} catch {
				summary.failures += 1
				return undefined
			} finally {
				release()
			}
		})
	)

	const resolved = await Promise.all(promises)
	const observed = counters.getMax()
	if (observed) {
		summary.maxConcurrencyObserved = observed
	}
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
		maxConcurrencyObserved: 1
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

	const concurrency = validateConcurrency(options.concurrency ?? config.SCHEDULER_CONCURRENCY)
	if (concurrency > config.SCHEDULER_CONCURRENCY) {
		throw new Error('Concurrency exceeds SCHEDULER_CONCURRENCY guardrail')
	}
	const configuredMaxPerRegion = validateConcurrency(
		options.maxPerRegion ?? Math.min(concurrency, 5)
	)
	const maxPerRegion = Math.min(configuredMaxPerRegion, 5)
	if (maxPerRegion > concurrency) {
		throw new Error('Per-region concurrency exceeds overall concurrency guardrail')
	}

	const regionLimiters = new Map<string, ReturnType<typeof pLimit>>()
	const counters = createConcurrencyCounter()

	const overallLimit = pLimit(concurrency)
	const tasks = items.map((item) => {
		const region = normalizeRegion(item.region)
		summary.regions[region] = (summary.regions[region] ?? 0) + 1
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
					summary.success += 1
					return result
				} catch {
					summary.failures += 1
					return undefined
				} finally {
					release()
				}
			})
		)
	})

	const resolved = await Promise.all(tasks)
	const observed = counters.getMax()
	if (observed) {
		summary.maxConcurrencyObserved = observed
	}
	return { results: resolved, summary }
}

function normalizeRegion(region?: string | null): string {
	if (!region || region.trim() === '') return 'us'
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
