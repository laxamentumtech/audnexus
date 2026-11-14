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

/** Rate-limit client reconnect backoff: the strategy must never return null
 * (a null stops ioredis, and rate-limit storage then keeps failing until a
 * restart); the capped delay keeps a flapping link bounded like the
 * per-item cache connection. */
export const RATE_LIMIT_RETRY_BASE_MS = 200
export const RATE_LIMIT_RETRY_CAP_MS = 3000

/** HTTP rate limiting uses bounded retries and capped reconnection against
 * durable control Redis, so a dropped link recovers without a restart. */
export function createRateLimitRedis(): Redis | null {
	const url = process.env.REDIS_URL
	if (!url) return null
	return new Redis(url, {
		commandTimeout: 1500,
		connectTimeout: 500,
		maxRetriesPerRequest: 1,
		retryStrategy: (times) => Math.min(times * RATE_LIMIT_RETRY_BASE_MS, RATE_LIMIT_RETRY_CAP_MS)
	})
}
