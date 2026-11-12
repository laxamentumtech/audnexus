import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test'

const constructorCalls: Array<{ url: string; options: Record<string, unknown>; client: object }> = []
mock.module('ioredis', () => ({
	Redis: class {
		constructor(url: string, options: Record<string, unknown>) {
			constructorCalls.push({ url, options, client: this })
		}
	}
}))

import { createRateLimitRedis, getCacheRedisUrl } from '#config/redis'

const savedRedisUrl = process.env.REDIS_URL
const savedCacheUrl = process.env.REDIS_CACHE_URL

afterEach(() => {
	constructorCalls.length = 0
	if (savedRedisUrl === undefined) delete process.env.REDIS_URL
	else process.env.REDIS_URL = savedRedisUrl
	if (savedCacheUrl === undefined) delete process.env.REDIS_CACHE_URL
	else process.env.REDIS_CACHE_URL = savedCacheUrl
})

describe('Redis role configuration', () => {
	test('routes rate limiting to bounded control Redis, not the cache URL', () => {
		process.env.REDIS_URL = 'redis://control.example:6379'
		process.env.REDIS_CACHE_URL = 'redis://cache.example:6379'

		const client = createRateLimitRedis()

		expect(client).toBeDefined()
		expect(constructorCalls[0]?.url).toBe('redis://control.example:6379')
		expect(constructorCalls[0]?.options).toEqual({
			commandTimeout: 1500,
			connectTimeout: 500,
			maxRetriesPerRequest: 1,
			retryStrategy: expect.any(Function)
		})
		expect((constructorCalls[0]?.options.retryStrategy as (attempt: number) => null)(1)).toBeNull()
	})

	test('uses REDIS_CACHE_URL and falls back to REDIS_URL for legacy deployments', () => {
		process.env.REDIS_URL = 'redis://control.example:6379'
		process.env.REDIS_CACHE_URL = 'redis://cache.example:6379'
		expect(getCacheRedisUrl()).toBe('redis://cache.example:6379')

		delete process.env.REDIS_CACHE_URL
		expect(getCacheRedisUrl()).toBe('redis://control.example:6379')
	})

	test('does not configure control Redis when REDIS_URL is absent', () => {
		delete process.env.REDIS_URL
		process.env.REDIS_CACHE_URL = 'redis://cache.example:6379'
		expect(createRateLimitRedis()).toBeNull()
		expect(constructorCalls).toHaveLength(0)
	})
})

afterAll(() => mock.restore())
