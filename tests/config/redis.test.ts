import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test'

// The ioredis mock would otherwise leak past mock.restore() into later test
// files of the same bun process: module-mock restoration only resets call
// state, so the real-socket redisBlackhole and rateLimitRedisRecovery tests
// would receive the mock (no `on` method). Capture the real CONSTRUCTOR
// value before the mock and re-mock it in afterAll to hand the real client
// back. Snapshot the value, not the live namespace: mock.module mutates the
// namespace in place, so a property read from it after the mock (as in the
// afterAll below) would resolve to the mock, not the real client — the same
// hazard documented in tests/worker.test.ts.
const realRedis = (await import('ioredis')).Redis

const constructorCalls: Array<{ url: string; options: Record<string, unknown>; client: object }> = []
mock.module('ioredis', () => ({
	Redis: class {
		constructor(url: string, options: Record<string, unknown>) {
			constructorCalls.push({ url, options, client: this })
		}
	}
}))

import {
	createRateLimitRedis,
	getCacheRedisUrl,
	RATE_LIMIT_RETRY_BASE_MS,
	RATE_LIMIT_RETRY_CAP_MS
} from '#config/redis'

const savedRedisUrl = process.env.REDIS_URL
const savedCacheUrl = process.env.REDIS_CACHE_URL

afterEach(() => {
	constructorCalls.length = 0
	if (savedRedisUrl === undefined) delete process.env.REDIS_URL
	else process.env.REDIS_URL = savedRedisUrl
	if (savedCacheUrl === undefined) delete process.env.REDIS_CACHE_URL
	else process.env.REDIS_CACHE_URL = savedCacheUrl
})

// REDIS_CACHE_TTL_SECONDS is read and validated ONCE at module import — the
// validation cannot be exercised in this process (the module is already
// loaded, with the env-dependent top-level already run), so the invalid-
// value cases run in a fresh `bun -e` subprocess with the env set (the
// repo root is the spawn cwd, so the `#config/redis` alias resolves), and
// the valid value is asserted in-process on RedisHelper.setOne's EX arg.
const ttlSubprocess = async (ttlValue: string, script: string): Promise<{ exitCode: number | null; output: string }> => {
	// Repo root: relative to THIS file's directory (tests/config/), two
	// levels up.
	const child = Bun.spawn(['bun', '-e', script], {
		cwd: new URL('../..', import.meta.url).pathname,
		env: { ...process.env, REDIS_CACHE_TTL_SECONDS: ttlValue },
		stdout: 'pipe',
		stderr: 'pipe'
	})
	const [stdout, stderr] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text()
	])
	const exitCode = await child.exited
	return { exitCode, output: stdout + stderr }
}

describe('REDIS_CACHE_TTL_SECONDS validation (module import)', () => {
	test.each(['abc', '0', '1.5'])(
		'throws for REDIS_CACHE_TTL_SECONDS=%s (non-integer / non-positive)',
		async (ttlValue) => {
			const { exitCode, output } = await ttlSubprocess(ttlValue, "await import('#config/redis')")
			expect(exitCode).not.toBe(0)
			expect(output).toContain('REDIS_CACHE_TTL_SECONDS must be a positive integer')
		}
	)

	test('a valid custom value reaches setOne EX argument and the exported constant', async () => {
		const { exitCode, output } = await ttlSubprocess(
			'7200',
			`
			const m = await import('#config/redis')
			const RedisHelper = (await import('#helpers/database/redis/RedisHelper')).default
			const calls = []
			const helper = new RedisHelper({ set: (...args) => { calls.push(args); return Promise.resolve('OK') } }, 'k', 'id', 'region')
			await helper.setOne({ a: 1 })
			console.log('EX_ARG=' + calls[0][3])
			console.log('TTL_CONST=' + m.REDIS_CACHE_TTL_SECONDS)
			`
		)
		expect(exitCode).toBe(0)
		expect(output).toContain('EX_ARG=7200')
		expect(output).toContain('TTL_CONST=7200')
	})
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
		// Bounded reconnect: the strategy returns a capped delay (never null,
		// which would terminal-disconnect and leave rate limiting broken until
		// restart). The cap keeps a flapping link from retrying too fast.
		const strategy = constructorCalls[0]?.options.retryStrategy as (attempt: number) => number | null
		expect(strategy(1)).toBe(RATE_LIMIT_RETRY_BASE_MS)
		expect(strategy(1000)).toBe(RATE_LIMIT_RETRY_CAP_MS)
		expect(strategy(100000)).toBe(RATE_LIMIT_RETRY_CAP_MS)
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

afterAll(() => {
	mock.module('ioredis', () => ({ Redis: realRedis }))
	mock.restore()
})
