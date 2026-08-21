import type { Mock } from 'bun:test'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

const mockPaprInitialize = mock()
const mockClientConnect = mock()
const mockClientClose = mock()
const mockClient = { connect: mockClientConnect, close: mockClientClose }
const mockCreateWorker = mock()
const mockGetWorker = mock()
const mockCloseQueue = mock()
const mockUpsertUpdateScheduler = mock()
const mockWorkerClose = mock()

// No real MongoDB/Redis/papr clients: CI has no services, and the worker
// module executes its import-time side effects (env guards, context creation),
// so its dependencies must be mocked BEFORE the module is loaded. Handler
// registration is not one of them — it only runs under the entrypoint gate,
// which is false under the test runner, which is exactly why these tests call
// registerShutdownHandlers() explicitly.
//
// CONSTRAINT — run this file with --parallel=1 (as the `bun run test` script
// does). Bun's mock.module is process-wide and sticky: under the default
// shared-process runner these PARTIAL module mocks (each exposing only the
// exports this file exercises) leak into sibling test files. In particular the
// 5-export '#helpers/jobs/bullmq' mock here would shadow the real module's
// full export surface for tests/helpers/jobs/bullmq.test.ts, which imports
// exports this partial mock omits (e.g. BACKFILL_ENQUEUE_LOCK_TTL_MS) and
// would fail with a missing-export SyntaxError. --parallel=1 runs each test
// file in its own worker process, so the mocks never escape this file. Do not
// run this file under default parallel `bun test` alongside other suites.
mock.module('#config/papr', () => ({
	initialize: mockPaprInitialize
}))
mock.module('#config/context', () => ({
	// matches the real Context shape: { client: MongoClient }
	createDefaultContext: mock(() => ({ client: mockClient }))
}))
mock.module('#helpers/jobs/bullmq', () => ({
	QUEUE_NAME: 'audnexus',
	closeQueue: mockCloseQueue,
	createWorker: mockCreateWorker,
	getWorker: mockGetWorker,
	upsertUpdateScheduler: mockUpsertUpdateScheduler
}))

// src/worker.ts runs its env guards at module load, so the required env must
// be set before the module is imported; static imports would hoist above this
// setup, so this deliberately uses a dynamic import (module-load boundary).
process.env.MONGODB_URI = 'mongodb://localhost:27017'
process.env.REDIS_URL = 'redis://localhost:6379'

// Baseline captured at the import boundary: the isWorkerEntrypoint gate
// (src/worker.ts) must be OFF under the test runner, so importing the module
// must add no signal listeners and must not trigger startup. Snapshot the
// pre-import listener counts (no signal listeners are added by this file or
// the runner before the import) and, right after the import, whether each
// startup mock fired. The flags are booleans, so beforeEach's mockClear()
// (which clears .mock.calls) can't retroactively falsify them.
const listenersBeforeImport = {
	term: process.listeners('SIGTERM').length,
	int: process.listeners('SIGINT').length
}
const worker = await import('../src/worker')
const startupStartedAtImport = {
	paprInitialize: mockPaprInitialize.mock.calls.length > 0,
	clientConnect: mockClientConnect.mock.calls.length > 0,
	createWorker: mockCreateWorker.mock.calls.length > 0,
	upsertUpdateScheduler: mockUpsertUpdateScheduler.mock.calls.length > 0
}

const savedEnv: Record<string, string | undefined> = {}
const originalExit = process.exit
let exitSpy: Mock<() => void>

beforeEach(() => {
	for (const key of ['MONGODB_URI', 'REDIS_URL', 'UPDATE_INTERVAL']) {
		savedEnv[key] = process.env[key]
	}
	process.env.MONGODB_URI = 'mongodb://localhost:27017'
	process.env.REDIS_URL = 'redis://localhost:6379'
	mockPaprInitialize.mockClear()
	mockClientConnect.mockClear()
	mockClientConnect.mockResolvedValue(mockClient)
	mockClientClose.mockClear()
	mockClientClose.mockResolvedValue(undefined)
	mockCreateWorker.mockClear()
	mockGetWorker.mockReset()
	mockGetWorker.mockReturnValue({ close: mockWorkerClose })
	mockCloseQueue.mockClear()
	mockCloseQueue.mockResolvedValue(undefined)
	mockUpsertUpdateScheduler.mockClear()
	mockWorkerClose.mockClear()
	mockWorkerClose.mockResolvedValue(undefined)

	// The shutdown handler ends with process.exit(0); stub it so the test
	// process survives.
	exitSpy = mock()
	process.exit = ((code?: number) => {
		exitSpy(code)
	}) as (code?: number) => never
})

afterEach(() => {
	process.exit = originalExit
	for (const key of ['MONGODB_URI', 'REDIS_URL', 'UPDATE_INTERVAL']) {
		if (savedEnv[key] === undefined) {
			delete process.env[key]
		} else {
			process.env[key] = savedEnv[key]
		}
	}
})

// registerShutdownHandlers() adds one SIGTERM and one SIGINT listener per
// call; under the test runner it is only invoked from tests (the module's
// auto-registration is behind the isWorkerEntrypoint gate, which is false
// here). This fires the newly registered SIGTERM listener to drive the
// shutdown chain, then removes BOTH listeners the call registered (the
// un-fired SIGINT one included) so no handlers accumulate across tests.
function fireAndRemove(): void {
	const beforeTerm = process.listeners('SIGTERM')
	const beforeInt = process.listeners('SIGINT')
	worker.registerShutdownHandlers()
	const afterTerm = process.listeners('SIGTERM') as Array<() => void>
	const afterInt = process.listeners('SIGINT') as Array<() => void>
	const addedTerm = afterTerm.slice(beforeTerm.length)
	const addedInt = afterInt.slice(beforeInt.length)
	addedTerm[0]()
	addedTerm.forEach((handler) => process.removeListener('SIGTERM', handler))
	addedInt.forEach((handler) => process.removeListener('SIGINT', handler))
}

describe('worker startup', () => {
	it('initializes papr with the connected client, upserts the schedule, then creates the worker, in order', async () => {
		const connectedClient = { connected: true }
		mockClientConnect.mockResolvedValueOnce(connectedClient)

		await expect(worker.startWorker()).resolves.toBeUndefined()

		expect(mockClientConnect).toHaveBeenCalledTimes(1)
		expect(mockPaprInitialize).toHaveBeenCalledTimes(1)
		expect(mockPaprInitialize).toHaveBeenCalledWith({ client: connectedClient })
		expect(mockUpsertUpdateScheduler).toHaveBeenCalledTimes(1)
		expect(mockCreateWorker).toHaveBeenCalledTimes(1)
		expect(mockClientConnect.mock.invocationCallOrder[0]).toBeLessThan(
			mockPaprInitialize.mock.invocationCallOrder[0]
		)
		expect(mockPaprInitialize.mock.invocationCallOrder[0]).toBeLessThan(
			mockUpsertUpdateScheduler.mock.invocationCallOrder[0]
		)
		expect(mockUpsertUpdateScheduler.mock.invocationCallOrder[0]).toBeLessThan(
			mockCreateWorker.mock.invocationCallOrder[0]
		)
	})

	it('upserts the update scheduler with the UPDATE_INTERVAL env value', async () => {
		process.env.UPDATE_INTERVAL = '12'
		await worker.startWorker()
		expect(mockUpsertUpdateScheduler).toHaveBeenCalledWith(12)
	})

	it('falls back to 30 when UPDATE_INTERVAL is unset or non-numeric', async () => {
		delete process.env.UPDATE_INTERVAL
		await worker.startWorker()
		expect(mockUpsertUpdateScheduler).toHaveBeenLastCalledWith(30)

		process.env.UPDATE_INTERVAL = 'not-a-number'
		await worker.startWorker()
		expect(mockUpsertUpdateScheduler).toHaveBeenLastCalledWith(30)
	})
})

describe('worker env guards', () => {
	it('requires MONGODB_URI before starting the worker', async () => {
		delete process.env.MONGODB_URI
		await expect(worker.startWorker()).rejects.toThrow('MONGODB_URI is required')
		expect(mockPaprInitialize).not.toHaveBeenCalled()
		expect(mockClientConnect).not.toHaveBeenCalled()
	})

	it('requires REDIS_URL before starting the worker', async () => {
		delete process.env.REDIS_URL
		await expect(worker.startWorker()).rejects.toThrow('REDIS_URL is required')
		expect(mockPaprInitialize).not.toHaveBeenCalled()
	})
})

describe('worker shutdown', () => {
	it('registers one handler for each of SIGTERM and SIGINT', () => {
		const beforeTerm = process.listeners('SIGTERM').length
		const beforeInt = process.listeners('SIGINT').length
		worker.registerShutdownHandlers()
		expect(process.listeners('SIGTERM').length).toBe(beforeTerm + 1)
		expect(process.listeners('SIGINT').length).toBe(beforeInt + 1)
		// clean up the pair registered above so it does not accumulate
		const term = process.listeners('SIGTERM') as Array<() => void>
		const int = process.listeners('SIGINT') as Array<() => void>
		process.removeListener('SIGTERM', term[term.length - 1])
		process.removeListener('SIGINT', int[int.length - 1])
	})

	it('closes the worker, queue, and mongo client in order, then exits 0', async () => {
		const gate = Promise.withResolvers<void>()
		mockClientClose.mockImplementationOnce(() => {
			gate.resolve()
			return gate.promise
		})

		fireAndRemove()

		// worker.close is called synchronously; the rest of the chain settles
		// on microtask turns (no timers).
		expect(mockWorkerClose).toHaveBeenCalledTimes(1)
		await gate.promise
		expect(mockCloseQueue).toHaveBeenCalledTimes(1)
		await Promise.resolve() // let the finally block run
		expect(exitSpy).toHaveBeenCalledWith(0)
		expect(mockWorkerClose.mock.invocationCallOrder[0]).toBeLessThan(
			mockCloseQueue.mock.invocationCallOrder[0]
		)
		expect(mockCloseQueue.mock.invocationCallOrder[0]).toBeLessThan(
			mockClientClose.mock.invocationCallOrder[0]
		)
	})

	it('still exits 0 via the finally path when a close() call rejects', async () => {
		mockWorkerClose.mockImplementationOnce(() => Promise.reject(new Error('worker close failed')))

		// shutdown rejects (the rejection propagates from the caller in the
		// real handler's `void shutdown()`), but the finally block must still
		// have called exit(0) first.
		await expect(worker.shutdown()).rejects.toThrow('worker close failed')
		expect(exitSpy).toHaveBeenCalledWith(0)
		expect(mockClientClose).not.toHaveBeenCalled()
	})
})

describe('worker import side effects', () => {
	// Pins the isWorkerEntrypoint contract (src/worker.ts): under the test
	// runner the module must import cleanly — no SIGTERM/SIGINT listeners
	// added, no startup triggered. Every other test in this file depends on
	// the gate being OFF; a regex/argv regression flipping it ON would
	// silently register handlers and auto-start at import without failing any
	// of those. Assert the delta attributable to the import: listener counts
	// against the pre-import baseline, and the import-time startup flags
	// captured right after the dynamic import above.
	it('registers no signal handlers and does not auto-start at import', () => {
		expect(process.listeners('SIGTERM').length).toBe(listenersBeforeImport.term)
		expect(process.listeners('SIGINT').length).toBe(listenersBeforeImport.int)
		expect(startupStartedAtImport.paprInitialize).toBe(false)
		expect(startupStartedAtImport.clientConnect).toBe(false)
		expect(startupStartedAtImport.createWorker).toBe(false)
		expect(startupStartedAtImport.upsertUpdateScheduler).toBe(false)
	})
})
