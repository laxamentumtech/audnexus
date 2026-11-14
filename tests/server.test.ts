import type { Mock } from 'bun:test'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import health from '#config/routes/health'
import { createMockLogger } from '#tests/setup/mockLogger'

const mockPaprInitialize = mock()
const mockPaprModel = mock((name: string) => name)
const mockClientConnect = mock()
const mockClientClose = mock()
const mockClient = { connect: mockClientConnect, close: mockClientClose }
const mockCloseQueue = mock()
const mockGetCacheRedis = mock()
const mockGetUpdateSchedulerIntervals = mock(() => ({ authors: 30, books: 30, chapters: 30 }))
const mockUpsertUpdateSchedulers = mock()

// The server module must import with no live dependencies: CI has no
// MongoDB/Redis, papr models call `papr.model` at module load, and the real
// Cloudflare IP fetch would hit the network. Bun's mock.module is
// process-wide and sticky; --parallel=1 (the `bun run test` script) runs
// each test file in its own worker process, so these partial mocks never
// escape this file (the same hazard documented in tests/worker.test.ts and
// tests/helpers/jobs/bullmq.test.ts). Do not run this file under default
// parallel `bun test` alongside other suites.
mock.module('#config/papr', () => ({
	initialize: mockPaprInitialize,
	// The real helper import below pulls the real module graph, whose models
	// default-import this mock and call `papr.model` at load; a bare factory
	// keeps registration inert (the tests never touch the models).
	default: { model: mockPaprModel },
	// The activation gate only runs when BOOK_HISTORY_ENABLED is true; keep
	// the gate inert so a flag set outside the runner cannot crash the import.
	bookHistoryStore: { assertHistoryPrerequisites: mock() }
}))
mock.module('#config/context', () => ({
	// matches the real Context shape: { client: MongoClient }
	createDefaultContext: mock(() => ({ client: mockClient }))
}))
// Partial by design: the server module (and registerUpdateScheduler via
// #helpers/jobs/schedule) binds exactly these names.
mock.module('#helpers/jobs/bullmq', () => ({
	closeQueue: mockCloseQueue,
	getCacheRedis: mockGetCacheRedis,
	getUpdateSchedulerIntervals: mockGetUpdateSchedulerIntervals,
	upsertUpdateSchedulers: mockUpsertUpdateSchedulers
}))
// Real ioredis would connect eagerly and retry forever (no Redis in CI),
// keeping the test process alive. The constructor capture mirrors
// tests/config/redis.test.ts: createRateLimitRedis() is the ONLY ioredis
// client the server flow creates (getCacheRedis is mocked), so the captured
// instance is provably the control-Redis client.
const redisConstructorCalls: Array<{ url: string; options: Record<string, unknown>; instance: object }> = []
mock.module('ioredis', () => ({
	Redis: class MockRedis {
		on = mock()
		quit = mock()
		disconnect = mock()
		constructor(url: string, options: Record<string, unknown> = {}) {
			redisConstructorCalls.push({ url, options, instance: this })
		}
	}
}))
// The route modules are default-exported `async (app) => { ... }` plugin
// functions. The real ones pull the full helper/model graph (papr, axios,
// redis helpers) at import — a mock with the same default-export shape
// keeps src/server.ts's real registerRoutes() exercised.
const mockRouteRegister = mock()
const mockRoutes = [
	'#config/routes/authors/delete',
	'#config/routes/authors/search/show',
	'#config/routes/authors/show',
	'#config/routes/books/artwork',
	'#config/routes/books/backfill',
	'#config/routes/books/chapters/delete',
	'#config/routes/books/chapters/show',
	'#config/routes/books/delete',
	'#config/routes/books/history',
	'#config/routes/books/historyDetail',
	'#config/routes/books/search/show',
	'#config/routes/books/show'
]
for (const routeModule of mockRoutes) {
	mock.module(routeModule, () => ({ default: mockRouteRegister }))
}
// The real metrics/perf-hook modules would load the whole performance graph;
// the server's registerRoutes only needs the functions to be callable.
mock.module('#config/routes/metrics', () => ({ registerMetricsRoute: mock() }))
mock.module('#config/performance/hooks', () => ({ registerPerformanceHooks: mock() }))
// Real @fastify/* plugins decorate the instance and would create a live
// client (@fastify/redis without a supplied one); the fakes below only
// stand in as registration identities (the fake register records, not
// invokes, them).
mock.module('@fastify/cors', () => ({ default: mock() }))
mock.module('@fastify/helmet', () => ({ default: mock() }))
mock.module('@fastify/rate-limit', () => ({ default: mock() }))
mock.module('@fastify/redis', () => ({ default: mock() }))
// No network in CI: buildTrustedProxies awaits this at start.
mock.module('#helpers/utils/cloudflareIps', () => ({ getAllIps: mock(async () => []) }))
// The REAL shutdown budget, with the default fresh budget shortened from
// 9000ms to 600ms: the hanging rate-limit quit test then hits its deadline
// on a real wall clock in well under a second. Explicit arguments
// (closeQueue's budgetMs) pass through unchanged, and closeWithTimeout /
// remainingShutdownBudget stay real, so the bounded-quit semantics are
// exercised end-to-end. The real values are snapshotted into a PLAIN object
// at capture time, NOT the live ESM namespace: mock.module mutates the
// namespace in place, so a namespace property (or static import binding)
// read inside the factory below would resolve to the wrapper itself and
// recurse — the same hazard documented in tests/worker.test.ts. The
// dynamic import is deliberate: a static import would hoist above the
// mocks and pull the real module graph in at the wrong boundary.
const realShutdownBudgetModule = await import('#helpers/utils/shutdownBudget')
const realShutdownBudget = {
	closeWithTimeout: realShutdownBudgetModule.closeWithTimeout,
	remainingShutdownBudget: realShutdownBudgetModule.remainingShutdownBudget,
	isShutdownBudgetExpired: realShutdownBudgetModule.isShutdownBudgetExpired,
	SHUTDOWN_REDIS_BUDGET_MS: realShutdownBudgetModule.SHUTDOWN_REDIS_BUDGET_MS,
	startShutdownBudget: realShutdownBudgetModule.startShutdownBudget
}
mock.module('#helpers/utils/shutdownBudget', () => ({
	closeWithTimeout: realShutdownBudget.closeWithTimeout,
	remainingShutdownBudget: realShutdownBudget.remainingShutdownBudget,
	isShutdownBudgetExpired: realShutdownBudget.isShutdownBudgetExpired,
	SHUTDOWN_REDIS_BUDGET_MS: realShutdownBudget.SHUTDOWN_REDIS_BUDGET_MS,
	startShutdownBudget: (budgetMs?: number) =>
		realShutdownBudget.startShutdownBudget(budgetMs ?? 600)
}))
// fastify() is the server-under-test seam: a minimal fastify-shaped object
// that records every register call (plugin identity + options) and never
// opens a socket. register returns a chainable object because
// registerRoutes chains `server.register(a).register(b)`. The drain's
// completion comes from the REAL closeServerWithTimeout against the tracked
// in-flight count (0 in these tests; the fake listener close settles).
interface FakeRedisClient {
	on: Mock
	quit: Mock
	disconnect: Mock
}
interface FakeRegisterRecord {
	plugin: unknown
	options?: Record<string, unknown>
}
const fakeRegisterCalls: FakeRegisterRecord[] = []
const chainable: { register: (plugin: unknown, options?: Record<string, unknown>) => typeof chainable } = {
	register: (plugin, options) => {
		fakeRegisterCalls.push({ plugin, options })
		return chainable
	}
}
const fakeApp = {
	log: createMockLogger(),
	register: mock((plugin: unknown, options?: Record<string, unknown>) => {
		fakeRegisterCalls.push({ plugin, options })
		return chainable
	}),
	listen: mock(),
	printRoutes: mock(() => ''),
	close: mock(() => Promise.resolve()),
	setErrorHandler: mock(),
	controlRedis: null as FakeRedisClient | null,
	server: {
		on: mock(),
		close: mock(() => Promise.resolve()),
		listening: false
	}
}
mock.module('fastify', () => ({ fastify: mock(() => fakeApp) }))

// src/server.ts throws at module load without MONGODB_URI, so the required
// env must be set before the import; static imports would hoist above this
// setup, so this deliberately uses a dynamic import (module-load boundary).
// MAX_REQUESTS is read (Number(...)) by the rate-limit registration options;
// an unset value yields NaN, which the wiring test would assert against.
process.env.MONGODB_URI = 'mongodb://localhost:27017'
process.env.MAX_REQUESTS = '300'

const listenersBeforeImport = {
	term: process.listeners('SIGTERM').length,
	int: process.listeners('SIGINT').length
}
const serverModule = await import('../src/server')
// The entry-script gate in src/server.ts (import.meta.url vs
// process.argv[1]) must be OFF under the test runner: importing the module
// must add no signal listeners and must not trigger startup. The booleans
// are read once at the import boundary — a mockClear() in beforeEach cannot
// retroactively falsify them.
const startedAtImport = mockPaprInitialize.mock.calls.length > 0 || mockClientConnect.mock.calls.length > 0

const savedEnv: Record<string, string | undefined> = {}
const originalExit = process.exit
let exitSpy: Mock<(code?: number) => void>
// Resolved by the process.exit stub so shutdown tests can await the exact
// moment exit fires instead of guessing microtask turns.
let exitCalled: Promise.withResolvers<void>

beforeEach(() => {
	for (const key of ['REDIS_URL', 'REDIS_CACHE_URL', 'BOOK_HISTORY_ENABLED']) {
		savedEnv[key] = process.env[key]
	}
	mockPaprInitialize.mockClear()
	mockPaprInitialize.mockResolvedValue(undefined)
	mockClientConnect.mockClear()
	mockClientConnect.mockResolvedValue(undefined)
	mockClientClose.mockClear()
	mockClientClose.mockResolvedValue(undefined)
	mockCloseQueue.mockReset()
	mockCloseQueue.mockResolvedValue(undefined)
	mockGetCacheRedis.mockReset()
	mockGetUpdateSchedulerIntervals.mockClear()
	mockUpsertUpdateSchedulers.mockClear()
	mockUpsertUpdateSchedulers.mockResolvedValue(undefined)
	mockRouteRegister.mockClear()
	redisConstructorCalls.length = 0
	fakeRegisterCalls.length = 0
	fakeApp.controlRedis = null
	exitSpy = mock()
	exitCalled = Promise.withResolvers<void>()
	process.exit = ((code?: number) => {
		exitSpy(code)
		exitCalled.resolve()
	}) as (code?: number) => never
})

afterEach(() => {
	process.exit = originalExit
	for (const key of ['REDIS_URL', 'REDIS_CACHE_URL', 'BOOK_HISTORY_ENABLED']) {
		if (savedEnv[key] === undefined) {
			delete process.env[key]
		} else {
			process.env[key] = savedEnv[key]
		}
	}
})

/** The plugin registrations: plugins are registered WITH options, routes
 * without, so the options presence is the identity discriminator. */
function pluginRegistrations(): Array<FakeRegisterRecord & { options: Record<string, unknown> }> {
	return fakeRegisterCalls.filter(
		(call): call is FakeRegisterRecord & { options: Record<string, unknown> } => call.options !== undefined
	)
}

describe('server import side effects', () => {
	it('starts nothing and registers no signal handlers on import (entry-script gate)', () => {
		expect(startedAtImport).toBe(false)
		expect(process.listeners('SIGTERM').length).toBe(listenersBeforeImport.term)
		expect(process.listeners('SIGINT').length).toBe(listenersBeforeImport.int)
	})
})

describe('server rate-limit wiring', () => {
	it('hands the rate-limit plugin the control-Redis client and the Redis plugin the shared cache client', async () => {
		const sharedCacheClient = {
			quit: mock(),
			disconnect: mock()
		}
		mockGetCacheRedis.mockReturnValue(sharedCacheClient)
		process.env.REDIS_URL = 'redis://control:6379'
		process.env.REDIS_CACHE_URL = 'redis://cache:6379'

		await serverModule.startServer()

		// Registration order in registerPlugins: @fastify/redis, cors,
		// helmet, rate-limit. The Redis plugin gets the SHARED cache client
		// via `client` (so it registers no plugin-owned close hook — the
		// cache client is closed by closeQueue under the shutdown budget,
		// not at server close), and no url option (a plugin-owned client
		// would be created).
		const plugins = pluginRegistrations()
		expect(plugins).toHaveLength(4)
		expect(plugins[0].options).toEqual({ client: sharedCacheClient })
		// The rate-limit plugin gets the createRateLimitRedis() instance —
		// the ONLY ioredis client this flow constructs, proven by the
		// constructor capture — with the global flag, the
		// MAX_REQUESTS-derived max, and the minute window. A wiring to the
		// shared cache client would put durable rate-limit counters in the
		// evictable store.
		expect(redisConstructorCalls).toHaveLength(1)
		expect(redisConstructorCalls[0].url).toBe('redis://control:6379')
		const controlClient = redisConstructorCalls[0].instance
		expect(plugins[3].options).toMatchObject({
			global: true,
			max: 300,
			redis: controlClient,
			timeWindow: '1 minute'
		})
		expect(plugins[3].options.redis).not.toBe(sharedCacheClient)
		// The same control client is the one the health route pings, and
		// the real health plugin was registered (a broken plugin order
		// would surface here).
		expect(fakeApp.controlRedis).toBe(controlClient)
		expect(fakeRegisterCalls.some((call) => call.plugin === health)).toBe(true)
	})
})

describe('server shutdown', () => {
	it('is single-flight: a second stopServer during pending teardown re-calls nothing', async () => {
		const closeResolvers = Promise.withResolvers<void>()
		mockCloseQueue.mockImplementationOnce(() => closeResolvers.promise)
		try {
			await serverModule.startServer()
			// Both calls land inside the first teardown's pending window:
			// call 1 starts the teardown (it parks on the controllable
			// closeQueue), call 2 hits the in-flight guard and returns the
			// SAME in-flight promise — the single-flight contract is also
			// identity.
			const teardown1 = serverModule.stopServer()
			const teardown2 = serverModule.stopServer()
			expect(teardown2).toBe(teardown1)
			// The barrier is the returned teardown promise's identity (the
			// toBe above: a second doStopServer would have created a second
			// promise) plus one macrotask tick: the chain from stopServer()
			// to the closeQueue call (drain done → race → finally →
			// closeQueue) is pure microtasks — inFlight is 0, so the drain
			// resolves immediately — and setImmediate fires only AFTER the
			// microtask queue is empty, so by the time it runs the teardown
			// is provably parked on the controllable closeQueue. The real
			// teardown cannot be awaited end-to-end here — it ends in
			// process.exit, stubbed by the exit spy — so the barrier stays
			// a slice of the chain, but a deterministic one (one tick), not
			// a 10-hop count.
			const parked = Promise.withResolvers<void>()
			setImmediate(parked.resolve)
			await parked.promise
			// Assert from the mocks WITHOUT settling the controllable
			// promise: the teardown reached the queue close exactly once —
			// a second doStopServer would have re-armed the budget and a
			// second closeQueue. No Mongo close / exit is in flight yet:
			// the teardown is still parked on the one closeQueue.
			expect(mockCloseQueue).toHaveBeenCalledTimes(1)
			expect(mockClientClose).not.toHaveBeenCalled()
			expect(exitSpy).not.toHaveBeenCalled()

			// Completing the ONE close lets the SAME teardown reach the
			// Mongo close and the process exit — no second close was ever
			// armed.
			closeResolvers.resolve()
			await exitCalled.promise // the stub resolves when process.exit fires
			expect(mockClientClose).toHaveBeenCalledTimes(1)
			expect(exitSpy).toHaveBeenCalledTimes(1)
			expect(exitSpy).toHaveBeenCalledWith(0)
		} finally {
			// Never leak the controllable promise into a later test.
			closeResolvers.resolve()
		}
	})

	it('reaches the Mongo close within the budget when the rate-limit quit hangs', async () => {
		process.env.REDIS_URL = 'redis://control:6379'
		process.env.REDIS_CACHE_URL = 'redis://cache:6379'
		mockGetCacheRedis.mockReturnValue({})

		await serverModule.startServer()
		// Hang the real control client's quit behind an offline command:
		// the bounded quit must be force-disconnected on the (shortened
		// 600ms) budget deadline, not awaited to completion.
		const controlClient = fakeApp.controlRedis
		expect(controlClient).not.toBeNull()
		controlClient.quit = mock(() => new Promise<never>(() => {}))
		const disconnectSpy = mock()
		controlClient.disconnect = disconnectSpy

		const started = Date.now()
		serverModule.stopServer()
		await exitCalled.promise // the stub resolves when process.exit fires
		expect(Date.now() - started).toBeLessThan(3000)
		// The force fallback ran exactly once — a regression that re-arms
		// the budget per close (double single-flight) would disconnect
		// twice, and a missing bound would not reach exit at all.
		expect(disconnectSpy).toHaveBeenCalledTimes(1)
		// The Mongo close and the clean exit followed the deadline.
		expect(mockClientClose).toHaveBeenCalledTimes(1)
		expect(exitSpy).toHaveBeenCalledTimes(1)
		expect(exitSpy).toHaveBeenCalledWith(0)
	})
})
