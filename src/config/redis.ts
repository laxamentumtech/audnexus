import { Redis } from 'ioredis'

const rawCacheTtl = process.env.REDIS_CACHE_TTL_SECONDS ?? '432000'
const cacheTtl = Number(rawCacheTtl)
if (!Number.isSafeInteger(cacheTtl) || cacheTtl <= 0) {
	throw new Error('REDIS_CACHE_TTL_SECONDS must be a positive integer')
}

/** Document-cache retention in seconds. Validated once when configuration loads. */
export const REDIS_CACHE_TTL_SECONDS = cacheTtl

/** External deployments may keep one Redis until they configure a cache role. */
export function getCacheRedisUrl(): string | undefined {
	return process.env.REDIS_CACHE_URL || process.env.REDIS_URL
}

/** HTTP rate limiting uses bounded retries against durable control Redis. */
export function createRateLimitRedis(): Redis | null {
	const url = process.env.REDIS_URL
	if (!url) return null
	return new Redis(url, {
		commandTimeout: 1500,
		connectTimeout: 500,
		maxRetriesPerRequest: 1,
		retryStrategy: () => null
	})
}
