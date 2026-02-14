import pLimit from 'p-limit'

import { getPerformanceConfig } from '#config/performance'

export interface BatchItem<T> {
	item: T
	region: string
}

export interface BatchProcessorOptions {
	concurrency?: number
	regionAware?: boolean
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
): Promise<(R | undefined)[]> {
	const config = getPerformanceConfig()

	// If parallel scheduler is disabled, process sequentially
	if (!config.USE_PARALLEL_SCHEDULER) {
		const results: (R | undefined)[] = []
		for (const item of items) {
			try {
				const result = await processor(item)
				results.push(result)
			} catch {
				results.push(undefined)
			}
		}
		return results
	}

	const concurrency = options.concurrency ?? config.SCHEDULER_CONCURRENCY
	const limit = pLimit(concurrency)

	const promises = items.map((item) =>
		limit(async () => {
			try {
				return await processor(item)
			} catch {
				return undefined
			}
		})
	)

	return Promise.all(promises)
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
): Promise<(R | undefined)[]> {
	const config = getPerformanceConfig()

	// If parallel scheduler is disabled, process sequentially
	if (!config.USE_PARALLEL_SCHEDULER) {
		const results: (R | undefined)[] = []
		for (const item of items) {
			try {
				const result = await processor(item)
				results.push(result)
			} catch {
				results.push(undefined)
			}
		}
		return results
	}

	const concurrency = options.concurrency ?? config.SCHEDULER_CONCURRENCY

	// Group items by region
	const byRegion = new Map<string, T[]>()
	for (const item of items) {
		const region = item.region ?? 'unknown'
		if (!byRegion.has(region)) {
			byRegion.set(region, [])
		}
		byRegion.get(region)!.push(item)
	}

	// Process each region's items with concurrency limit
	const regionPromises: Promise<(R | undefined)[]>[] = []
	for (const [, regionItems] of byRegion) {
		const limit = pLimit(concurrency)
		const promises = regionItems.map((item) =>
			limit(async () => {
				try {
					return await processor(item)
				} catch {
					return undefined
				}
			})
		)
		regionPromises.push(Promise.all(promises))
	}

	// Flatten results from all regions
	const regionResults = await Promise.all(regionPromises)
	return regionResults.flat()
}
