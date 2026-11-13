// Exercise the actual API entry point's asynchronous readiness boundary.
// Module mocks are isolated by the repository's --parallel=1 test contract.
import { expect, mock, test } from 'bun:test'
import { createRequire } from 'node:module'

const requireFromTest = createRequire(import.meta.url)

const initialized = Promise.withResolvers<void>()
const entered = Promise.withResolvers<void>()
const listening = Promise.withResolvers<void>()
const listen = mock(async () => { listening.resolve(); return 'http://127.0.0.1:3000' })
const register = mock()
const server = {
	log: { info: mock(), warn: mock(), error: mock() },
	register,
	printRoutes: () => '',
	listen,
	close: mock(async () => {})
}
register.mockReturnValue(server)
const schedule = mock(async () => {})
const initialize = mock(async () => { entered.resolve(); await initialized.promise })
mock.module('fastify', () => ({ fastify: () => server }))
mock.module('#config/context', () => ({ createDefaultContext: () => ({ client: { connect: async () => ({}) } }) }))
mock.module('#config/papr', () => ({
	initialize,
	bookHistoryStore: { assertHistoryPrerequisites: mock(async () => {}) }
}))
mock.module('#config/errorHandler', () => ({ registerApiErrorHandler: mock() }))
mock.module('#config/performance/hooks', () => ({ registerPerformanceHooks: mock() }))
mock.module('#config/routes/metrics', () => ({ registerMetricsRoute: mock() }))
mock.module('#helpers/jobs/bullmq', () => ({ closeQueue: mock(), getUpdateSchedulerIntervals: () => ({ authors: 0, books: 0, chapters: 0 }) }))
mock.module('#helpers/jobs/schedule', () => ({ registerUpdateScheduler: schedule }))
mock.module('#helpers/utils/cloudflareIps', () => ({ getAllIps: async () => [] }))
for (const route of [
	'authors/delete', 'authors/search/show', 'authors/show', 'books/artwork',
	'books/backfill', 'books/chapters/delete', 'books/chapters/show', 'books/delete',
	'books/history', 'books/historyDetail', 'books/search/show', 'books/show', 'health'
]) mock.module(`#config/routes/${route}`, () => ({ default: mock() }))

test('API neither schedules nor opens its listener before shared index initialization completes', async () => {
	const saved = { MONGODB_URI: process.env.MONGODB_URI, REDIS_URL: process.env.REDIS_URL, REDIS_CACHE_URL: process.env.REDIS_CACHE_URL, BOOK_HISTORY_ENABLED: process.env.BOOK_HISTORY_ENABLED }
	const beforeTerm = new Set(process.listeners('SIGTERM'))
	const beforeInt = new Set(process.listeners('SIGINT'))
	process.env.MONGODB_URI = 'mongodb://localhost:27017'
	delete process.env.REDIS_URL
	delete process.env.REDIS_CACHE_URL
	delete process.env.BOOK_HISTORY_ENABLED
	try {
		// Intentional import-boundary test: importing the real entry starts it.
		await import('../../src/server')
		await entered.promise
		expect(listen).not.toHaveBeenCalled()
		expect(schedule).not.toHaveBeenCalled()
		initialized.resolve()
		await listening.promise
		expect(schedule).toHaveBeenCalledTimes(1)
		expect(listen).toHaveBeenCalledTimes(1)
	} finally {
		initialized.resolve()
		for (const handler of process.listeners('SIGTERM')) if (!beforeTerm.has(handler)) process.removeListener('SIGTERM', handler)
		for (const handler of process.listeners('SIGINT')) if (!beforeInt.has(handler)) process.removeListener('SIGINT', handler)
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	}
})

test('API initialization rejection exits with status 1 without scheduling or listening', async () => {
	const saved = { MONGODB_URI: process.env.MONGODB_URI, REDIS_URL: process.env.REDIS_URL, REDIS_CACHE_URL: process.env.REDIS_CACHE_URL, BOOK_HISTORY_ENABLED: process.env.BOOK_HISTORY_ENABLED }
	const beforeTerm = new Set(process.listeners('SIGTERM'))
	const beforeInt = new Set(process.listeners('SIGINT'))
	const originalExit = process.exit
	const exited = Promise.withResolvers<number | string | null | undefined>()
	const exit = mock((status?: number | string | null) => { exited.resolve(status) })
	const failure = new Error('required index initialization failed')
	listen.mockClear()
	schedule.mockClear()
	initialize.mockRejectedValueOnce(failure)
	process.exit = exit as typeof process.exit
	process.env.MONGODB_URI = 'mongodb://localhost:27017'
	delete process.env.REDIS_URL
	delete process.env.REDIS_CACHE_URL
	delete process.env.BOOK_HISTORY_ENABLED
	try {
		// Bun keys its module registry by resolved path and ignores query
		// strings, so evict the cached entry to execute the real entry point
		// again rather than reusing the startup cached by the previous test.
		delete requireFromTest.cache[requireFromTest.resolve('../../src/server.ts')]
		await import('../../src/server.ts')
		expect(await exited.promise).toBe(1)
		await Promise.resolve()
		expect(exit).toHaveBeenCalledTimes(1)
		expect(server.log.error).toHaveBeenCalledWith(failure)
		expect(listen).not.toHaveBeenCalled()
		expect(schedule).not.toHaveBeenCalled()
	} finally {
		process.exit = originalExit
		for (const handler of process.listeners('SIGTERM')) if (!beforeTerm.has(handler)) process.removeListener('SIGTERM', handler)
		for (const handler of process.listeners('SIGINT')) if (!beforeInt.has(handler)) process.removeListener('SIGINT', handler)
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	}
})
