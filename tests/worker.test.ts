import type { Mock } from 'bun:test'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

const mockPaprInitialize = mock()
// Inert stand-in for the default-exported Papr instance: the real models call
// `papr.model(name, schema)` at module load; returning the collection name
// keeps the mock observable without any model behavior.
const mockPaprModel = mock((name: string) => name)
const mockClientConnect = mock()
const mockClientClose = mock()
const mockCreateIndex = mock(() => Promise.resolve())
const mockClientDb = mock(() => ({
	collection: mock(() => ({ createIndex: mockCreateIndex }))
}))
const mockClient = { connect: mockClientConnect, close: mockClientClose, db: mockClientDb }
const mockCreateWorker = mock()
const mockGetWorker = mock()
const mockCloseQueue = mock()
const mockQueueRedisDisconnect = mock()
// The forced-disconnect fallbacks (the worker's, and the closeQueue
// collaborator's queue phase) both target the shared queue Redis client;
// the tests observe the disconnects on it, not on any close's internals.
const mockGetQueueRedisClient = mock(() => ({ disconnect: mockQueueRedisDisconnect }))
const mockUpsertUpdateSchedulers = mock()
const mockAssertHistoryPrerequisites = mock()
// Mirrors the real helper (strict `\d+` parse: explicit 0 disables, anything
// non-numeric falls back to 30) so the worker test can assert on the derived
// object.
const parseNonNegativeInt = (raw: string | undefined, fallback: number): number => {
	const trimmed = raw?.trim()
	if (trimmed && /^\d+$/.test(trimmed)) {
		const parsed = Number(trimmed)
		if (Number.isSafeInteger(parsed)) return parsed
	}
	return fallback
}
const mockGetUpdateSchedulerIntervals = mock(() => {
	const base = parseNonNegativeInt(process.env.UPDATE_INTERVAL, 30)
	const chapters = parseNonNegativeInt(process.env.UPDATE_INTERVAL_CHAPTERS, 30)
	return { authors: base, books: base, chapters }
})
const mockWorkerClose = mock()
// Deadline the test's startShutdownBudget wrapper installs into the REAL
// budget state (see the '#helpers/jobs/bullmq' mock below): the closeQueue
// collaborator uses it to apply the helper's expired-budget branch.
let testBudgetDeadline = 0
// Opt-in for the closeQueue collaborator's queue phase (reset per test):
// true only in the exhausted-budget test, where the queue close hangs behind
// an offline command and the remaining ~1 ms budget force-cleans it. Default
// false: a healthy queue settles promptly, within its remaining budget.
let queuePhaseHangs = false

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
	initialize: mockPaprInitialize,
	// The real helper import below pulls the real module graph, whose models
	// default-import this mock and call `papr.model` at load; a bare factory
	// keeps registration inert (the tests never touch the models).
	default: { model: mockPaprModel },
	// The worker's activation gate calls assertHistoryPrerequisites only when
	// BOOK_HISTORY_ENABLED is true; the mock doubles as the gate's assertion
	// seam for the history-enabled tests below.
	bookHistoryStore: { assertHistoryPrerequisites: mockAssertHistoryPrerequisites }
}))
mock.module('#config/context', () => ({
	// matches the real Context shape: { client: MongoClient }
	createDefaultContext: mock(() => ({ client: mockClient }))
}))
// Capture the REAL helper's closeWithTimeout + shutdown-budget functions
// AFTER the papr/context mocks (so the real module's model deps load with
// the mocks, not the real papr) and BEFORE the bullmq mock below shadows it:
// the shutdown tests wire these real values into the mock, so shutdown()
// exercises the real deadline/budget semantics (only worker.close,
// closeQueue, and the queue Redis client stay mocked). Dynamic import is a
// deliberate module-loading-boundary capture: a static import would hoist
// above the mocks and pull in the real papr/models.
// Snapshot the REAL helper's function values into a PLAIN object at capture
// time, not the live ESM namespace: mock.module below mutates the namespace
// in place, so a namespace property accessed after the mock (e.g. inside the
// startShutdownBudget wrapper) would resolve to the wrapper itself and
// recurse. The values captured here are the real functions, stable for the
// life of the process.
const realBullmqModule = await import('#helpers/jobs/bullmq')
const realBullmq = {
	closeWithTimeout: realBullmqModule.closeWithTimeout,
	remainingShutdownBudget: realBullmqModule.remainingShutdownBudget,
	startShutdownBudget: realBullmqModule.startShutdownBudget
}

// closeWithTimeout / startShutdownBudget / remainingShutdownBudget are the
// REAL helper values (captured above): shutdown() runs the real deadline and
// budget semantics, so a removed or reordered startShutdownBudget hands the
// worker close a 0–1 ms deadline that force-disconnects before the graceful
// close finishes.
mock.module('#helpers/jobs/bullmq', () => ({
	QUEUE_NAME: 'audnexus',
	closeQueue: mockCloseQueue,
	closeWithTimeout: realBullmq.closeWithTimeout,
	createWorker: mockCreateWorker,
	getQueueRedisClient: mockGetQueueRedisClient,
	getUpdateSchedulerIntervals: mockGetUpdateSchedulerIntervals,
	getWorker: mockGetWorker,
	remainingShutdownBudget: realBullmq.remainingShutdownBudget,
	// The real budget state, with the DEFAULT fresh budget shortened from
	// 9000ms to 600ms: the budget-exhaustion test needs the worker close to
	// hit its deadline on a real wall clock in seconds. Explicit arguments
	// (the graceful-close test's 0) pass through unchanged, and 600ms still
	// beats that test's 300ms close with margin.
	startShutdownBudget: (budgetMs?: number) => {
		const fresh = budgetMs ?? 600
		testBudgetDeadline = Date.now() + fresh
		realBullmq.startShutdownBudget(fresh)
	},
	upsertUpdateSchedulers: mockUpsertUpdateSchedulers
}))

// closeQueue collaborator: honors the helper's public budget contract —
// an explicit `budgetMs` is the aggregate for the queue phase, while an
// expired (or never-started) real deadline means a fresh 9000ms, mirroring
// closeQueue's own expired-budget branch. By default the queue close settles
// promptly (a healthy queue closes gracefully inside its remaining budget,
// no disconnect). Only when `queuePhaseHangs` is set does the queue close
// hang behind an offline command, force-cleaned by the REAL closeWithTimeout
// deadline via the queue Redis disconnect — there the budget is observable
// in wall time and the forced cleanup, not in call wiring.
const queuePhaseClose = (options?: { budgetMs?: number }) => {
	const deadlineMs =
		options?.budgetMs !== undefined
			? options.budgetMs
			: testBudgetDeadline <= Date.now()
				? 9000
				: testBudgetDeadline - Date.now()
	return realBullmq.closeWithTimeout(
		() => (queuePhaseHangs ? new Promise<never>(() => {}) : Promise.resolve()),
		() => mockQueueRedisDisconnect(),
		'queue',
		deadlineMs
	)
}

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
	upsertUpdateSchedulers: mockUpsertUpdateSchedulers.mock.calls.length > 0
}

const savedEnv: Record<string, string | undefined> = {}
const originalExit = process.exit
let exitSpy: Mock<(code?: number) => void>
// Resolved by the process.exit stub so shutdown tests can await the exact
// moment exit(0) fires instead of guessing microtask turns.
let exitCalled: Promise.withResolvers<void>

beforeEach(() => {
	for (const key of ['MONGODB_URI', 'REDIS_URL', 'UPDATE_INTERVAL', 'UPDATE_INTERVAL_CHAPTERS', 'BOOK_HISTORY_ENABLED']) {
		savedEnv[key] = process.env[key]
	}
	process.env.MONGODB_URI = 'mongodb://localhost:27017'
	process.env.REDIS_URL = 'redis://localhost:6379'
	// The disabled-case tests require the flag to be OFF under the runner,
	// regardless of how the process was started (afterEach restores it).
	delete process.env.BOOK_HISTORY_ENABLED
	mockPaprInitialize.mockClear()
	mockClientConnect.mockClear()
	mockClientConnect.mockResolvedValue(mockClient)
	mockClientClose.mockClear()
	mockClientClose.mockResolvedValue(undefined)
	mockCreateWorker.mockClear()
	mockGetWorker.mockReset()
	mockGetWorker.mockReturnValue({ close: mockWorkerClose })
	mockCloseQueue.mockClear()
	mockCloseQueue.mockImplementation(queuePhaseClose)
	queuePhaseHangs = false
	testBudgetDeadline = 0
	mockQueueRedisDisconnect.mockClear()
	mockUpsertUpdateSchedulers.mockClear()
	mockWorkerClose.mockClear()
	mockWorkerClose.mockResolvedValue(undefined)
	mockAssertHistoryPrerequisites.mockClear()
	mockAssertHistoryPrerequisites.mockResolvedValue(undefined)
	// Deliberately NO budget is started here: the helper module's budget
	// state is real in this file (shutdown() calls the real
	// startShutdownBudget), and the delayed-close test below relies on it
	// being unset beforehand so a removed/reordered startShutdownBudget is
	// observable as a 0 ms deadline. The existing shutdown tests keep
	// passing without it: their worker close settles in a microtask, which
	// wins a 0 ms (macrotask) deadline.

	// The shutdown handler ends with process.exit(0); stub it so the test
	// process survives.
	exitSpy = mock()
	exitCalled = Promise.withResolvers<void>()
	process.exit = ((code?: number) => {
		exitSpy(code)
		exitCalled.resolve()
	}) as (code?: number) => never
})

afterEach(() => {
	process.exit = originalExit
	for (const key of ['MONGODB_URI', 'REDIS_URL', 'UPDATE_INTERVAL', 'UPDATE_INTERVAL_CHAPTERS', 'BOOK_HISTORY_ENABLED']) {
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
		// The stale-walk index must target papr's explicit database, not the
		// URI default.
		expect(mockClientDb).toHaveBeenCalledWith('audnexus')
		expect(mockCreateIndex).toHaveBeenCalledTimes(3)
		expect(mockCreateIndex).toHaveBeenCalledWith(
			{ updatedAt: 1, _id: 1 },
			{ name: 'updatedAt_1__id_1' }
		)
		expect(mockUpsertUpdateSchedulers).toHaveBeenCalledTimes(1)
		expect(mockCreateWorker).toHaveBeenCalledTimes(1)
		expect(mockClientConnect.mock.invocationCallOrder[0]).toBeLessThan(
			mockPaprInitialize.mock.invocationCallOrder[0]
		)
		expect(mockPaprInitialize.mock.invocationCallOrder[0]).toBeLessThan(
			mockUpsertUpdateSchedulers.mock.invocationCallOrder[0]
		)
		expect(mockUpsertUpdateSchedulers.mock.invocationCallOrder[0]).toBeLessThan(
			mockCreateWorker.mock.invocationCallOrder[0]
		)
	})

	it('upserts the update scheduler with the derived per-collection intervals', async () => {
		process.env.UPDATE_INTERVAL = '12'
		process.env.UPDATE_INTERVAL_CHAPTERS = '45'
		await worker.startWorker()
		expect(mockUpsertUpdateSchedulers).toHaveBeenCalledWith({
			authors: 12,
			books: 12,
			chapters: 45
		})
	})

	it('falls back to 30 when UPDATE_INTERVAL is unset or non-numeric', async () => {
		delete process.env.UPDATE_INTERVAL
		delete process.env.UPDATE_INTERVAL_CHAPTERS
		await worker.startWorker()
		expect(mockUpsertUpdateSchedulers).toHaveBeenLastCalledWith({
			authors: 30,
			books: 30,
			chapters: 30
		})

		process.env.UPDATE_INTERVAL = 'not-a-number'
		await worker.startWorker()
		expect(mockUpsertUpdateSchedulers).toHaveBeenLastCalledWith({
			authors: 30,
			books: 30,
			chapters: 30
		})
	})
})

describe('worker history activation gate', () => {
	it('skips assertHistoryPrerequisites when history is disabled', async () => {
		await worker.startWorker()
		expect(mockAssertHistoryPrerequisites).not.toHaveBeenCalled()
	})

	it('calls assertHistoryPrerequisites before scheduling when enabled', async () => {
		process.env.BOOK_HISTORY_ENABLED = 'true'
		await worker.startWorker()
		expect(mockAssertHistoryPrerequisites).toHaveBeenCalledTimes(1)
		// The gate runs before the schedule is upserted, so a deployment
		// that cannot record never schedules update jobs.
		expect(mockAssertHistoryPrerequisites.mock.invocationCallOrder[0]).toBeLessThan(
			mockUpsertUpdateSchedulers.mock.invocationCallOrder[0]
		)
	})

	it('fails closed when the prerequisites check rejects while enabled', async () => {
		process.env.BOOK_HISTORY_ENABLED = 'true'
		mockAssertHistoryPrerequisites.mockRejectedValue(
			new Error('BOOK_HISTORY_ENABLED requires a transaction-capable MongoDB replica set and prepared history indexes')
		)
		await expect(worker.startWorker()).rejects.toThrow('replica set and prepared history indexes')
		expect(mockCreateWorker).not.toHaveBeenCalled()
		expect(mockUpsertUpdateSchedulers).not.toHaveBeenCalled()
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

		// worker.close is deferred one microtask turn by closeWithTimeout
		// (mirrored by the mock), so flush that turn before asserting the
		// call; the rest of the chain settles on later microtask turns.
		await Promise.resolve()
		expect(mockWorkerClose).toHaveBeenCalledTimes(1)
		await gate.promise
		expect(mockCloseQueue).toHaveBeenCalledTimes(1)
		await exitCalled.promise // the stub resolves when process.exit fires
		expect(exitSpy).toHaveBeenCalledWith(0)
		expect(mockWorkerClose.mock.invocationCallOrder[0]).toBeLessThan(
			mockCloseQueue.mock.invocationCallOrder[0]
		)
		expect(mockCloseQueue.mock.invocationCallOrder[0]).toBeLessThan(
			mockClientClose.mock.invocationCallOrder[0]
		)
	})

	it('bounds a DELAYED graceful worker close with the aggregate budget, not a 0 ms deadline', async () => {
		// startShutdownBudget is REAL here: the expired budget (0 ms) set
		// below means shutdown() itself must start the fresh aggregate,
		// leaving ~9000 ms for the worker close. Removing or moving
		// startShutdownBudget after the close hands closeWithTimeout the
		// 1 ms floor, and the deadline force-disconnects the shared queue
		// Redis client at 1 ms — BEFORE the graceful 300 ms close finishes
		// (skipping the in-flight drain the budget exists to protect). The
		// assertion is the observable disconnect, not the call wiring.
		// Real wall-clock time is deliberate: closeWithTimeout's deadline
		// is a real platform timer, so fake timers cannot substitute.
		realBullmq.startShutdownBudget(0) // expired: shutdown must start its own
		mockWorkerClose.mockImplementationOnce(
			() => new Promise<void>((resolve) => setTimeout(resolve, 300))
		)
		const started = Date.now()
		await worker.shutdown()
		expect(mockWorkerClose).toHaveBeenCalledTimes(1)
		// No premature deadline: the graceful close won, so nothing was
		// force-disconnected and the queue/Mongo closes ran.
		expect(mockQueueRedisDisconnect).not.toHaveBeenCalled()
		expect(mockCloseQueue).toHaveBeenCalledTimes(1)
		expect(mockClientClose).toHaveBeenCalledTimes(1)
		expect(exitSpy).toHaveBeenCalledWith(0)
		// The shutdown actually WAITED for the graceful close (a 0 ms
		// deadline would have exited this well before 300 ms).
		expect(Date.now() - started).toBeGreaterThanOrEqual(300 - 50)
	})

	it('bounds closeQueue with the REMAINING budget when the worker close exhausts it', async () => {
		// The worker close hangs: it hits the full 600ms aggregate deadline
		// and is force-cleaned (observable on the queue Redis disconnect).
		// The queue phase hangs too (offline-blocked behind the dead
		// connection): with the budget EXHAUSTED, closeQueue must NOT restart
		// a fresh 9000ms budget — the helper's expired-budget branch, which is
		// what `await closeQueue()` without a forwarded remainder triggers —
		// whose forced queue cleanup would land ~9s out, past the 10s stop
		// grace. Forwarding remainingShutdownBudget() charges the queue phase
		// against the aggregate: total elapsed stays ~600ms, not ~9.6s.
		mockWorkerClose.mockImplementationOnce(() => new Promise<never>(() => {}))
		queuePhaseHangs = true
		const started = Date.now()
		await worker.shutdown()
		const elapsed = Date.now() - started
		expect(elapsed).toBeLessThan(3000)
		// The worker close hit its deadline: forced disconnect ran.
		expect(mockQueueRedisDisconnect).toHaveBeenCalled()
		// The queue phase still ran and the Mongo close followed, all inside
		// the original aggregate budget.
		expect(mockCloseQueue).toHaveBeenCalledTimes(1)
		expect(mockClientClose).toHaveBeenCalledTimes(1)
		expect(exitSpy).toHaveBeenCalledWith(0)
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
		expect(startupStartedAtImport.upsertUpdateSchedulers).toBe(false)
	})
})
