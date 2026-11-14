import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type Mock,
	mock,
	vi
} from 'bun:test'

import { closeServerWithTimeout } from '#helpers/utils/httpShutdown'
import { createMockLogger } from '#tests/setup/mockLogger'

const mockQueueAdd = mock()
const mockQueueUpsert = mock()
const mockQueueGetJobs = mock()
const mockQueueClose = mock()
const mockQueueRemove = mock()
const mockQueueRemoveJobScheduler = mock()
const mockRedisQuit = mock()
const mockRedisSet = mock()
const mockRedisGet = mock()
const mockRedisDel = mock()
const mockRedisEval = mock()
const mockRedisLrange = mock()
const mockRedisLrem = mock()
const mockRedisExists = mock()
const mockWorkerClose = mock()
const mockWorkerOn = mock()
const mockSchedulerUpdateAuthors = mock()
const mockSchedulerUpdateBooks = mock()
const mockSchedulerUpdateChapters = mock()
const mockBackfillProcess = mock()

// Capture the real ioredis CONSTRUCTOR value before the mock: the mock would
// otherwise leak past mock.restore() into later test files of the same bun
// process (the real-socket tests under tests/config expect the real client).
// Snapshot the value, not the live namespace: mock.module mutates the
// namespace in place, so a property read from it after the mock (as in the
// afterAll re-mock below) would resolve to the mock, not the real client —
// the same hazard documented in tests/worker.test.ts.
const realRedis = (await import('ioredis')).Redis

// No real ioredis sockets: CI has no Redis service, and ioredis connects
// eagerly and retries forever, which would keep the test process alive.
// `status` reads from `mockRedisStatus` so tests can flip it to exercise the
// non-ready connection paths. `redisConstructorCalls` captures each
// constructor invocation (args + created instance) so tests can assert the
// per-connection options and dead-singleton re-creation.
let mockRedisStatus: string = 'ready'
const redisConstructorCalls: Array<{
	url: string
	options: Record<string, unknown>
	instance: object
}> = []

mock.module('ioredis', () => ({
	Redis: class {
		get status() {
			return mockRedisStatus
		}
		on = mock(() => {})
		quit = mockRedisQuit
		disconnect = mock(() => {})
		set = mockRedisSet
		get = mockRedisGet
		del = mockRedisDel
		eval = mockRedisEval
		lrange = mockRedisLrange
		lrem = mockRedisLrem
		exists = mockRedisExists
		constructor(url: string, options: Record<string, unknown> = {}) {
			redisConstructorCalls.push({ url, options, instance: this })
		}
	}
}))

// `mockJobFromIdSequence` feeds Job.fromId calls in order; each entry is a
// mock job ({ getState }) or null (no job record).
let mockJobFromIdSequence: Array<{ getState: () => Promise<string> } | null> = [null]
const mockJobFromId = mock(() => mockJobFromIdSequence.shift() ?? null)

mock.module('bullmq', () => ({
	Queue: class {
		add = mockQueueAdd
		upsertJobScheduler = mockQueueUpsert
		getJobs = mockQueueGetJobs
		close = mockQueueClose
		remove = mockQueueRemove
		removeJobScheduler = mockQueueRemoveJobScheduler
	},
	Worker: class {
		close = mockWorkerClose
		on = mockWorkerOn
	},
	Job: class {
		static fromId = mockJobFromId
	}
}))

mock.module('#helpers/utils/UpdateScheduler', () => ({
	default: class UpdateScheduler {
		updateAuthors = mockSchedulerUpdateAuthors
		updateBooks = mockSchedulerUpdateBooks
		updateChapters = mockSchedulerUpdateChapters
	}
}))

const backfillConstructorArgs: unknown[][] = []
mock.module('#helpers/routes/BookBackfillHelper', () => ({
	default: class BookBackfillHelper {
		constructor(...args: unknown[]) {
			backfillConstructorArgs.push(args)
		}
		process = mockBackfillProcess
	}
}))

import {
	BACKFILL_ENQUEUE_LOCK_KEY,
	BACKFILL_ENQUEUE_LOCK_TTL_MS,
	closeQueue,
	COMMAND_TIMEOUT_MS,
	countBackfillJobsInFlight,
	createWorker,
	enqueueBackfillRatings,
	getCacheRedis,
	getQueueRedis,
	getQueueRedisClient,
	getUpdateSchedulerIntervals,
	handleJob,
	JOB_NAMES,
	JOB_RETRIES,
	LEGACY_UPDATE_SCHEDULER_ID,
	QUEUE_NAME,
	QueueUnavailableError,
	UPDATE_SCHEDULER_IDS,
	UPDATE_SCHEDULERS,
	upsertUpdateSchedulers,
	withCommandTimeout
} from '#helpers/jobs/bullmq'
import {
	closeWithTimeout,
	remainingShutdownBudget,
	SHUTDOWN_REDIS_BUDGET_MS,
	startShutdownBudget
} from '#helpers/utils/shutdownBudget'
import { TEST_REDIS_URL } from '#tests/setup/performanceConfig'

let savedRedisUrl: string | undefined
let savedRedisCacheUrl: string | undefined

beforeEach(() => {
	savedRedisUrl = process.env.REDIS_URL
	savedRedisCacheUrl = process.env.REDIS_CACHE_URL
	process.env.REDIS_URL = TEST_REDIS_URL
	delete process.env.REDIS_CACHE_URL
	mockRedisStatus = 'ready'
	mockJobFromIdSequence = [null]
	backfillConstructorArgs.length = 0
	redisConstructorCalls.length = 0
	// mockReset (not mockClear) so the per-test once-queues never leak:
	// a leftover resolved/rejected-once on add/remove would be consumed by a
	// later test before its own stubbing.
	mockQueueAdd.mockReset()
	mockQueueRemove.mockReset()
	mockQueueRemove.mockResolvedValue(undefined)
	mockQueueUpsert.mockClear()
	mockQueueRemoveJobScheduler.mockClear()
	mockQueueGetJobs.mockReset()
	// Default: no jobs in any state — ensureUpdateSchedulesWillRun then
	// enqueues a boot pass per collection, which individual tests override.
	mockQueueGetJobs.mockResolvedValue([])
	mockSchedulerUpdateAuthors.mockReset()
	mockSchedulerUpdateBooks.mockReset()
	mockSchedulerUpdateChapters.mockReset()
	mockJobFromId.mockClear()
	mockJobFromId.mockImplementation(() => mockJobFromIdSequence.shift() ?? null)
	mockRedisSet.mockReset()
	mockRedisSet.mockResolvedValue('OK')
	mockRedisGet.mockReset()
	mockRedisGet.mockResolvedValue(null)
	mockRedisDel.mockReset()
	mockRedisDel.mockResolvedValue(1)
	mockRedisEval.mockReset()
	mockRedisEval.mockResolvedValue(1)
	mockRedisLrange.mockReset()
	// Default: empty active list — no orphans in the common path.
	mockRedisLrange.mockResolvedValue([])
	mockRedisLrem.mockReset()
	mockRedisLrem.mockResolvedValue(1)
	mockRedisExists.mockReset()
	mockRedisExists.mockResolvedValue(1)
})

afterEach(() => {
	if (savedRedisUrl === undefined) {
		delete process.env.REDIS_URL
	} else {
		process.env.REDIS_URL = savedRedisUrl
	}
	if (savedRedisCacheUrl === undefined) {
		delete process.env.REDIS_CACHE_URL
	} else {
		process.env.REDIS_CACHE_URL = savedRedisCacheUrl
	}
})

describe('bullmq queue helpers', () => {
	it('requires REDIS_URL before creating the shared connection', () => {
		delete process.env.REDIS_URL
		expect(() => getQueueRedis()).toThrow('REDIS_URL is required for background job queues')
	})

	it('returns null without creating a connection before any queue use', () => {
		// The shutdown fallbacks (worker close, closeQueue's queue phase)
		// must be able to observe the shared client WITHOUT opening one on
		// their way out — a non-creating accessor that returns null before
		// any queue use, and no ioredis construction as a side effect.
		// The singletons were released by an earlier closeQueue, so this
		// exercises the fresh-process shape; the constructor-capture mock
		// (redisConstructorCalls) is cleared in beforeEach.
		expect(getQueueRedisClient()).toBeNull()
		expect(redisConstructorCalls).toHaveLength(0)
	})

	it('returns the same connection on repeat calls', () => {
		expect(getQueueRedis()).toBe(getQueueRedis())
	})

	it('uses the audnexus queue name', () => {
		expect(QUEUE_NAME).toBe('audnexus')
	})

	it('enqueues the backfill-ratings job with retry options and a deterministic job id', async () => {
		mockJobFromIdSequence = [null] // no existing record → nothing to remove
		mockQueueAdd.mockResolvedValueOnce({ id: 'job-2' })
		await expect(enqueueBackfillRatings()).resolves.toBe('job-2')
		expect(mockQueueAdd).toHaveBeenCalledWith(
			JOB_NAMES.backfillRatings,
			{},
			expect.objectContaining({ ...JOB_RETRIES, jobId: 'backfill-ratings' })
		)
	})

	describe('enqueueBackfillRatings → removeTerminatedBackfillJob', () => {
		// Job.fromId is called twice when the first read is terminal (initial
		// read + re-read right before the remove); the sequence entries are
		// consumed in call order. Each entry is a mock job or null.
		const jobState = (state: string) => ({ getState: () => Promise.resolve(state) })
		const cases: Array<{
			name: string
			sequence: Array<{ getState: () => Promise<string> } | null>
			expectRemove: boolean
		}> = [
			{ name: 'removes nothing when no job record exists', sequence: [null], expectRemove: false },
			{
				name: 'leaves a waiting record alone',
				sequence: [jobState('waiting')],
				expectRemove: false
			},
			{
				name: 'removes a completed record (re-read confirms completed) then adds',
				sequence: [jobState('completed'), jobState('completed')],
				expectRemove: true
			},
			{
				name: 'removes a failed record (re-read confirms failed) then adds',
				sequence: [jobState('failed'), jobState('failed')],
				expectRemove: true
			},
			{
				name: 'skips the remove when the re-read finds a fresh waiting record',
				sequence: [jobState('completed'), jobState('waiting')],
				expectRemove: false
			}
		]
		for (const { name, sequence, expectRemove } of cases) {
			it(name, async () => {
				mockJobFromIdSequence = sequence
				mockQueueAdd.mockResolvedValueOnce({ id: 'job-3' })
				mockQueueRemove.mockResolvedValueOnce(undefined)
				await expect(enqueueBackfillRatings()).resolves.toBe('job-3')
				if (expectRemove) {
					expect(mockQueueRemove).toHaveBeenCalledTimes(1)
					expect(mockQueueRemove).toHaveBeenCalledWith('backfill-ratings')
				} else {
					expect(mockQueueRemove).not.toHaveBeenCalled()
				}
				// the add always fires, after the (skipped or performed) remove
				expect(mockQueueAdd).toHaveBeenCalledWith(
					JOB_NAMES.backfillRatings,
					{},
					expect.objectContaining({ ...JOB_RETRIES, jobId: 'backfill-ratings' })
				)
			})
		}
	})

	describe('enqueueBackfillRatings → backfill-enqueue lock', () => {
		it('two concurrent enqueues end as a single deduplicated job; the lock is released after', async () => {
			// The first SET (the winner, started first) acquires the lock →
			// remove+add → release in finally. Every later SET is contested
			// (null) until the winner releases, so the loser burns its
			// bounded spin (0ms per attempt here — near-zero retry delay
			// keeps this off wall-clock timers) and
			// falls back to a plain add. Both adds share the deterministic
			// job id, which is what collapses them into exactly ONE
			// active/waiting job in real BullMQ — the lock only serializes
			// the remove+add critical section, dedup guarantees single-flight.
			let setCalls = 0
			let lockedToken: string | null = null
			// Simulate SET NX semantics: the first SET acquires (stores its
			// token), every later SET is contested — the loser burns its
			// bounded spin (0ms apart) and falls back to a plain add.
			mockRedisSet.mockImplementation((_key, token) =>
				Promise.resolve(setCalls++ === 0 ? ((lockedToken = token as string), 'OK') : null)
			)
			mockJobFromIdSequence = [null, null]
			mockQueueAdd.mockResolvedValueOnce({ id: 'job-winner' })
			mockQueueAdd.mockResolvedValueOnce({ id: 'job-loser' })
			const winner = enqueueBackfillRatings({ retryMs: 0 })
			const loser = enqueueBackfillRatings({ retryMs: 0 })
			const [winnerId, loserId] = await Promise.all([winner, loser])
			expect([winnerId, loserId]).toEqual(['job-winner', 'job-loser'])
			expect(mockQueueRemove).not.toHaveBeenCalled()
			expect(mockQueueAdd).toHaveBeenCalledTimes(2)
			for (const call of mockQueueAdd.mock.calls) {
				expect(call[2]).toEqual(
					expect.objectContaining({ ...JOB_RETRIES, jobId: 'backfill-ratings' })
				)
			}
			// winner: 1 acquired attempt; loser: all 10 attempts lost
			expect(mockRedisSet).toHaveBeenCalledTimes(11)
			const winnerSet = mockRedisSet.mock.calls[0]
			expect(winnerSet[0]).toBe(BACKFILL_ENQUEUE_LOCK_KEY)
			expect(winnerSet[1]).toBe(lockedToken) // per-acquire ownership token
			expect(winnerSet.slice(2)).toEqual(['PX', BACKFILL_ENQUEUE_LOCK_TTL_MS, 'NX'])
			// every SET carries a unique token — no shared '1' value
			const seenTokens = new Map<string, number>()
			for (const token of mockRedisSet.mock.calls.map((call) => call[1] as string)) {
				seenTokens.set(token, (seenTokens.get(token) ?? 0) + 1)
			}
			expect([...seenTokens.values()]).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
			// the winner's finally ran the atomic compare-and-del (Lua eval
			// with key + ownership token); the loser never held it
			expect(mockRedisEval).toHaveBeenCalledTimes(1)
			expect(mockRedisEval).toHaveBeenCalledWith(
				expect.stringContaining('redis.call'),
				1,
				BACKFILL_ENQUEUE_LOCK_KEY,
				lockedToken
			)
			expect(mockRedisGet).not.toHaveBeenCalled()
			expect(mockRedisDel).not.toHaveBeenCalled()
		})

		it('releases the lock on the normal path and never re-acquires it', async () => {
			// The atomic compare-and-del script carries the acquired token as
			// ARGV[1]; a different (or expired) stored value is a no-op
			// inside Redis, so no client-side GET/DEL happens at all.
			let acquiredToken = ''
			mockRedisSet.mockImplementation((_key, token) => {
				acquiredToken = token as string
				return Promise.resolve('OK')
			})
			mockJobFromIdSequence = [null]
			mockQueueAdd.mockResolvedValueOnce({ id: 'job-x' })
			await expect(enqueueBackfillRatings()).resolves.toBe('job-x')
			expect(mockRedisSet).toHaveBeenCalledTimes(1)
			expect(mockRedisEval).toHaveBeenCalledTimes(1)
			expect(mockRedisEval).toHaveBeenCalledWith(
				expect.stringContaining('redis.call'),
				1,
				BACKFILL_ENQUEUE_LOCK_KEY,
				acquiredToken
			)
		})

		it('never deletes a lock it does not own (token mismatch on release)', async () => {
			// Simulates the holder's lock self-expiring mid-section and a
			// second holder re-acquiring: the first holder's release script
			// compares against its own token, and Redis performs the
			// compare-and-del atomically — a stored foreign token makes the
			// script a no-op, so no separate client-side del exists to
			// assert against.
			let acquiredToken = ''
			mockRedisSet.mockImplementation((_key, token) => {
				acquiredToken = token as string
				return Promise.resolve('OK')
			})
			mockJobFromIdSequence = [null]
			mockQueueAdd.mockResolvedValueOnce({ id: 'job-stale' })
			await expect(enqueueBackfillRatings()).resolves.toBe('job-stale')
			// the release carried the holder's own token, not the foreign
			// one that a re-acquiring holder would have stored; the mismatch
			// is resolved inside the atomic script
			expect(mockRedisEval).toHaveBeenCalledTimes(1)
			expect(mockRedisEval).toHaveBeenCalledWith(
				expect.stringContaining('redis.call'),
				1,
				BACKFILL_ENQUEUE_LOCK_KEY,
				acquiredToken
			)
			expect(acquiredToken).not.toContain('someone-elses-token')
			expect(mockRedisDel).not.toHaveBeenCalled()
		})

		it('serializes a real remove+add: the loser never runs remove, no fresh job deleted', async () => {
			// A terminal (completed) record exists at enqueue time. The
			// first enqueue (the winner) takes the lock, confirms the
			// re-read as completed, removes the terminal record, and
			// adds the fresh waiting job. The second enqueue (the loser)
			// contests the held lock on every spin attempt (0ms apart
			// here — near-zero retry delay keeps this off wall-clock
			// timers), exhausts its bounded spin, and falls back to a
			// plain add — which by design skips the remove entirely. So
			// the freshly added waiting job can never be deleted by the
			// concurrent enqueue's remove, and the remove fires exactly
			// once. Both adds share the deterministic jobId, which real
			// BullMQ's atomic add script dedups into exactly one job
			// (the mock records both adds).
			const completedJob = { getState: () => Promise.resolve('completed') }
			// winner: initial read + re-read; the loser never reads
			// (spin exhausts → plain add skips removeTerminatedBackfillJob)
			mockJobFromIdSequence = [completedJob, completedJob]
			// first SET acquires (winner), every later SET (the loser's
			// spin) is contested
			let setCalls = 0
			let acquiredToken = ''
			mockRedisSet.mockImplementation((_key, token) => {
				const acquired = setCalls++ === 0
				if (acquired) acquiredToken = token as string
				return Promise.resolve(acquired ? 'OK' : null)
			})
			const callOrder: string[] = []
			mockQueueRemove.mockImplementationOnce(() => {
				callOrder.push('remove')
				return Promise.resolve(undefined)
			})
			mockQueueAdd.mockImplementationOnce(() => {
				callOrder.push('add')
				return Promise.resolve({ id: 'job-winner' })
			})
			mockQueueAdd.mockImplementationOnce(() => {
				callOrder.push('add')
				return Promise.resolve({ id: 'job-loser' })
			})
			const [winnerId, loserId] = await Promise.all([
				enqueueBackfillRatings({ retryMs: 0 }),
				enqueueBackfillRatings({ retryMs: 0 })
			])
			expect([winnerId, loserId]).toEqual(['job-winner', 'job-loser'])
			// exactly one remove: the winner removed the terminal record;
			// the loser burned its spin and skipped via plain add, so it
			// never touched removeTerminatedBackfillJob — verified both
			// here and by the fromId count below (the loser never read the
			// record at all)
			expect(mockQueueRemove).toHaveBeenCalledTimes(1)
			expect(mockQueueRemove).toHaveBeenCalledWith('backfill-ratings')
			// both adds fire and share the deterministic job id → exactly
			// one job in real BullMQ (atomic add dedup)
			expect(mockQueueAdd).toHaveBeenCalledTimes(2)
			for (const call of mockQueueAdd.mock.calls) {
				expect(call[2]).toEqual(
					expect.objectContaining({ ...JOB_RETRIES, jobId: 'backfill-ratings' })
				)
			}
			// only the winner ran the terminal-record pass: initial read +
			// re-read; the loser's spin exhausted, so plain add, no reads
			expect(mockJobFromId).toHaveBeenCalledTimes(2)
			// no remove after a fresh waiting job exists: remove only runs
			// under the lock (removeTerminatedBackfillJob), and the loser
			// never holds the lock — so nothing can delete a freshly
			// added job. The flag pins that invariant without asserting a
			// fragile exact cross-enqueue interleaving.
			let seenFreshJob = false
			for (const call of callOrder) {
				if (call === 'add') seenFreshJob = true
				expect(call === 'remove' && seenFreshJob).toBe(false)
			}
			// winner: 1 acquired attempt; loser: all 10 spin attempts lost
			expect(mockRedisSet).toHaveBeenCalledTimes(11)
			// the winner released via the atomic compare-and-del carrying
			// its own token; the loser never held it
			expect(mockRedisEval).toHaveBeenCalledTimes(1)
			expect(mockRedisEval).toHaveBeenCalledWith(
				expect.stringContaining('redis.call'),
				1,
				BACKFILL_ENQUEUE_LOCK_KEY,
				acquiredToken
			)
		})

		it('skips the remove (plain add) and never releases the lock when the lock times out', async () => {
			// All 10 lock attempts fail → bounded spin exhausts (0ms apart
			// here — near-zero retry delay keeps this off wall-clock
			// timers) → the add proceeds WITHOUT removing: BullMQ's atomic
			// jobId dedup still guarantees single-flight; the lock is not
			// released because we never acquired it.
			mockRedisSet.mockResolvedValue(null)
			mockJobFromIdSequence = [null]
			mockQueueAdd.mockResolvedValueOnce({ id: 'job-timeout' })
			await expect(enqueueBackfillRatings({ retryMs: 0 })).resolves.toBe('job-timeout')
			expect(mockQueueRemove).not.toHaveBeenCalled()
			expect(mockQueueAdd).toHaveBeenCalledTimes(1)
			// 10 bounded attempts, then give up
			expect(mockRedisSet).toHaveBeenCalledTimes(10)
			expect(mockRedisDel).not.toHaveBeenCalled()
			expect(mockRedisEval).not.toHaveBeenCalled()
		})

		it('still resolves when the release itself fails (TTL is the backstop)', async () => {
			// The atomic compare-and-del release swallows errors by design:
			// the PX TTL is the backstop, so a release failure must never
			// fail the enqueue.
			let acquiredToken = ''
			mockRedisSet.mockImplementation((_key, token) => {
				acquiredToken = token as string
				return Promise.resolve('OK')
			})
			// the release script rejects during release
			mockRedisEval.mockRejectedValueOnce(new Error('lock release failed'))
			mockJobFromIdSequence = [null]
			mockQueueAdd.mockResolvedValueOnce({ id: 'job-release-fail' })
			await expect(enqueueBackfillRatings()).resolves.toBe('job-release-fail')
			// the add fired and the release attempted (atomic eval with the
			// holder's token), but the eval failure did not leak out
			expect(mockRedisEval).toHaveBeenCalledTimes(1)
			expect(mockRedisEval).toHaveBeenCalledWith(
				expect.stringContaining('redis.call'),
				1,
				BACKFILL_ENQUEUE_LOCK_KEY,
				acquiredToken
			)
		})

		it('releases the lock on the ownership-checked path when the critical section throws', async () => {
			// A terminal record exists; the remove rejects, so the whole
			// enqueue must reject — but the finally must still run the
			// atomic compare-and-del release with the holder's token.
			const completedJob = { getState: () => Promise.resolve('completed') }
			mockJobFromIdSequence = [completedJob, completedJob]
			let acquiredToken = ''
			mockRedisSet.mockImplementation((_key, token) => {
				acquiredToken = token as string
				return Promise.resolve('OK')
			})
			mockQueueRemove.mockRejectedValueOnce(new Error('remove boom'))
			mockQueueAdd.mockResolvedValueOnce({ id: 'job-never' })
			await expect(enqueueBackfillRatings()).rejects.toThrow('remove boom')
			// the critical section threw before the add, so no job was enqueued
			expect(mockQueueRemove).toHaveBeenCalledTimes(1)
			expect(mockQueueAdd).not.toHaveBeenCalled()
			// the finally ran the release: the atomic eval carried the
			// holder's own token (ownership check happens inside Redis)
			expect(mockRedisEval).toHaveBeenCalledTimes(1)
			expect(mockRedisEval).toHaveBeenCalledWith(
				expect.stringContaining('redis.call'),
				1,
				BACKFILL_ENQUEUE_LOCK_KEY,
				acquiredToken
			)
		})
	})

	describe('upsertUpdateSchedulers', () => {
		// BullMQ repeat has no day unit — the interval is passed in MILLISECONDS.
		const cases: Array<{ days: number; everyMs: number }> = [
			{ days: 30, everyMs: 2_592_000_000 },
			{ days: 0.5, everyMs: 43_200_000 }
		]
		for (const { days, everyMs } of cases) {
			it(`upserts one scheduler per collection for ${days} day(s) as a ms interval`, async () => {
				await upsertUpdateSchedulers({ authors: days, books: days, chapters: days })
				expect(mockQueueRemoveJobScheduler).toHaveBeenCalledWith(LEGACY_UPDATE_SCHEDULER_ID)
				for (const [schedulerId, name] of Object.entries(UPDATE_SCHEDULERS)) {
					// `immediately` is deliberately absent: with `every` it is a
					// documented no-op that console.warns per scheduler per boot.
					expect(mockQueueUpsert).toHaveBeenCalledWith(
						schedulerId,
						{ every: everyMs },
						{
							name,
							opts: expect.objectContaining(JOB_RETRIES)
						}
					)
				}
			})
		}

		it('waits out the connect handshake instead of failing a cold connection', async () => {
			// Cold-boot regression: the first guard call creates the ioredis
			// client in the same tick, so a synchronous status read hard-failed
			// every container boot (worker exit 1 on the LXC207 dev deploy).
			vi.useFakeTimers()
			try {
				mockRedisStatus = 'connecting'
				const pending = upsertUpdateSchedulers({ authors: 30, books: 30, chapters: 30 })
				vi.advanceTimersByTime(50)
				mockRedisStatus = 'ready'
				vi.advanceTimersByTime(50)
				await pending
				// one upsert per collection
				expect(mockQueueUpsert).toHaveBeenCalledTimes(Object.keys(UPDATE_SCHEDULERS).length)
			} finally {
				vi.useRealTimers()
			}
		})

		it('sweeps ghost active-list entries before upserting the schedulers', async () => {
			// 2026-10-06 incident: restarts mid-job leaked active-list entries
			// whose job records were gone; the boot first occurrence deduped
			// against the ghost and the boot-only schedule never fired again.
			const ghostId = 'repeat:update-all-scheduler:123'
			mockRedisLrange.mockResolvedValue([ghostId, 'real-job'])
			// First exists call (the ghost) → 0; second (a real job) → 1.
			mockRedisExists.mockResolvedValueOnce(0).mockResolvedValueOnce(1)

			await upsertUpdateSchedulers({ authors: 30, books: 30, chapters: 30 })

			expect(mockRedisLrem).toHaveBeenCalledWith('bull:audnexus:active', 0, ghostId)
			expect(mockRedisLrem).not.toHaveBeenCalledWith('bull:audnexus:active', 0, 'real-job')
			expect(mockRedisDel).toHaveBeenCalledWith(`bull:audnexus:${ghostId}:lock`)
		})

		it('enqueues a boot pass per collection when none is active or waiting', async () => {
			// After a ghost sweep (or any dedup loss) the boot-only schedule has
			// no pending occurrence for up to a full interval; the boot must not
			// trust the upsert alone.
			mockQueueGetJobs.mockResolvedValue([])

			await upsertUpdateSchedulers({ authors: 30, books: 30, chapters: 30 })

			for (const name of Object.values(UPDATE_SCHEDULERS)) {
				expect(mockQueueAdd).toHaveBeenCalledWith(
					name,
					{},
					expect.objectContaining({
						jobId: expect.stringMatching(new RegExp(`^boot-${name}-\\d+$`))
					})
				)
			}
		})

		it('does not enqueue a boot pass for disabled collections', async () => {
			// A non-positive interval disables the collection: no scheduler and
			// no boot pass (the disabled list must be matched against the
			// scheduler ids, not the interval keys).
			mockQueueGetJobs.mockResolvedValue([])
			mockQueueAdd.mockClear()

			await upsertUpdateSchedulers({ authors: 30, books: 0, chapters: 0 })

			expect(mockQueueAdd).toHaveBeenCalledTimes(1)
			expect(mockQueueAdd).toHaveBeenCalledWith(
				JOB_NAMES.updateAuthors,
				{},
				expect.objectContaining({
					jobId: expect.stringMatching(/^boot-update-authors-\d+$/)
				})
			)
			expect(mockQueueAdd).not.toHaveBeenCalledWith(JOB_NAMES.updateBooks, {}, expect.anything())
			expect(mockQueueAdd).not.toHaveBeenCalledWith(JOB_NAMES.updateChapters, {}, expect.anything())
		})

		it('does not enqueue a boot pass when a collection already has a job in flight', async () => {
			// An active (or waiting) occurrence for a collection means that
			// collection is already running; the other two still get a boot pass.
			mockQueueGetJobs.mockResolvedValue([{ name: JOB_NAMES.updateBooks }])
			mockQueueAdd.mockClear()

			await upsertUpdateSchedulers({ authors: 30, books: 30, chapters: 30 })

			expect(mockQueueAdd).not.toHaveBeenCalledWith(JOB_NAMES.updateBooks, {}, expect.anything())
			expect(mockQueueAdd).toHaveBeenCalledTimes(Object.keys(UPDATE_SCHEDULERS).length - 1)
		})

		it('skips the boot pass while still upserting schedulers (API-side registration)', async () => {
			// The API (re)creates the repeatable jobs on every boot; with
			// `skipBootPass` it must NOT enqueue the boot passes — the worker
			// owns those, and each API replica fanning out a full boot pass
			// would multiply the staleness walk per replica.
			mockQueueGetJobs.mockResolvedValue([])
			mockQueueAdd.mockClear()

			await upsertUpdateSchedulers({ authors: 30, books: 30, chapters: 30 }, { skipBootPass: true })

			expect(mockQueueUpsert).toHaveBeenCalledTimes(Object.keys(UPDATE_SCHEDULERS).length)
			expect(mockQueueRemoveJobScheduler).toHaveBeenCalledWith(LEGACY_UPDATE_SCHEDULER_ID)
			expect(mockQueueAdd).not.toHaveBeenCalled()
		})

		it('upserts no scheduler and adds no boot pass for disabled collections when skipBootPass is set', async () => {
			// A disabled collection must get neither a scheduler nor a boot
			// pass; `skipBootPass` must not change the disabled handling.
			mockQueueGetJobs.mockResolvedValue([])
			mockQueueAdd.mockClear()

			await upsertUpdateSchedulers({ authors: 30, books: 0, chapters: 0 }, { skipBootPass: true })

			expect(mockQueueUpsert).toHaveBeenCalledTimes(1)
			expect(mockQueueAdd).not.toHaveBeenCalled()
		})
	})

	describe('getUpdateSchedulerIntervals', () => {
		it('defaults chapters to 30 days and mirrors UPDATE_INTERVAL for authors/books', () => {
			const savedInterval = process.env.UPDATE_INTERVAL
			const savedChapters = process.env.UPDATE_INTERVAL_CHAPTERS
			delete process.env.UPDATE_INTERVAL
			delete process.env.UPDATE_INTERVAL_CHAPTERS
			try {
				expect(getUpdateSchedulerIntervals()).toEqual({
					authors: 30,
					books: 30,
					chapters: 30
				})
			} finally {
				if (savedInterval === undefined) delete process.env.UPDATE_INTERVAL
				else process.env.UPDATE_INTERVAL = savedInterval
				if (savedChapters === undefined) delete process.env.UPDATE_INTERVAL_CHAPTERS
				else process.env.UPDATE_INTERVAL_CHAPTERS = savedChapters
			}
		})

		it('preserves an explicit zero interval instead of defaulting it', () => {
			const savedInterval = process.env.UPDATE_INTERVAL
			const savedChapters = process.env.UPDATE_INTERVAL_CHAPTERS
			process.env.UPDATE_INTERVAL = '36500'
			process.env.UPDATE_INTERVAL_CHAPTERS = '0'
			try {
				expect(getUpdateSchedulerIntervals()).toEqual({
					authors: 36500,
					books: 36500,
					chapters: 0
				})
			} finally {
				if (savedInterval === undefined) delete process.env.UPDATE_INTERVAL
				else process.env.UPDATE_INTERVAL = savedInterval
				if (savedChapters === undefined) delete process.env.UPDATE_INTERVAL_CHAPTERS
				else process.env.UPDATE_INTERVAL_CHAPTERS = savedChapters
			}
		})

		it('reads UPDATE_INTERVAL and UPDATE_INTERVAL_CHAPTERS independently', () => {
			const savedInterval = process.env.UPDATE_INTERVAL
			const savedChapters = process.env.UPDATE_INTERVAL_CHAPTERS
			process.env.UPDATE_INTERVAL = '7'
			process.env.UPDATE_INTERVAL_CHAPTERS = '30'
			try {
				expect(getUpdateSchedulerIntervals()).toEqual({
					authors: 7,
					books: 7,
					chapters: 30
				})
			} finally {
				if (savedInterval === undefined) delete process.env.UPDATE_INTERVAL
				else process.env.UPDATE_INTERVAL = savedInterval
				if (savedChapters === undefined) delete process.env.UPDATE_INTERVAL_CHAPTERS
				else process.env.UPDATE_INTERVAL_CHAPTERS = savedChapters
			}
		})
	})

	it('does not create a scheduler for non-positive day intervals', async () => {
		mockQueueUpsert.mockClear()
		await upsertUpdateSchedulers({ authors: 0, books: 0, chapters: -1 })
		expect(mockQueueUpsert).not.toHaveBeenCalled()
	})

	it('skips only the collections whose interval is non-positive', async () => {
		mockQueueUpsert.mockClear()
		mockQueueRemoveJobScheduler.mockClear()
		await upsertUpdateSchedulers({ authors: 30, books: 0, chapters: 0 })
		expect(mockQueueUpsert).toHaveBeenCalledTimes(1)
		// Disabling a collection removes its existing scheduler, not just skips
		// the upsert — otherwise a prior occurrence keeps firing.
		expect(mockQueueRemoveJobScheduler).toHaveBeenCalledWith(UPDATE_SCHEDULER_IDS.books)
		expect(mockQueueRemoveJobScheduler).toHaveBeenCalledWith(UPDATE_SCHEDULER_IDS.chapters)
		expect(mockQueueRemoveJobScheduler).not.toHaveBeenCalledWith(UPDATE_SCHEDULER_IDS.authors)
		expect(mockQueueUpsert).toHaveBeenCalledWith(
			UPDATE_SCHEDULER_IDS.authors,
			{ every: 2_592_000_000 },
			{
				name: JOB_NAMES.updateAuthors,
				opts: expect.objectContaining(JOB_RETRIES)
			}
		)
	})

	it('counts only backfill jobs across waiting, active, delayed, and paused', async () => {
		// The three update schedulers each keep a persistent delayed job in the
		// queue; queue-wide counts would make the backfill route permanently 409.
		mockQueueGetJobs.mockResolvedValueOnce([
			{ name: JOB_NAMES.backfillRatings },
			{ name: JOB_NAMES.backfillRatings },
			{ name: JOB_NAMES.updateAuthors },
			{ name: JOB_NAMES.updateBooks },
			{ name: JOB_NAMES.updateChapters }
		])
		await expect(countBackfillJobsInFlight()).resolves.toBe(2)
		expect(mockQueueGetJobs).toHaveBeenCalledWith(['waiting', 'active', 'delayed', 'paused'])
		mockQueueGetJobs.mockResolvedValueOnce([])
		await expect(countBackfillJobsInFlight()).resolves.toBe(0)
	})

	it('rejects guarded queue operations when the connection never becomes ready', async () => {
		vi.useFakeTimers()
		try {
			mockRedisStatus = 'connecting'
			// Run concurrently so each operation pays the same ready deadline once.
			const results = Promise.allSettled([
				enqueueBackfillRatings(),
				countBackfillJobsInFlight(),
				upsertUpdateSchedulers({ authors: 30, books: 30, chapters: 30 })
			])
			vi.advanceTimersByTime(COMMAND_TIMEOUT_MS + 100)
			for (const result of await results) {
				expect(result.status).toBe('rejected')
				if (result.status === 'rejected') {
					expect(result.reason).toBeInstanceOf(QueueUnavailableError)
				}
			}
			expect(mockQueueAdd).not.toHaveBeenCalled()
			expect(mockQueueGetJobs).not.toHaveBeenCalled()
			expect(mockQueueUpsert).not.toHaveBeenCalled()
		} finally {
			vi.useRealTimers()
		}
	})

	it('fails a still-pending command when the connection drops mid-flight', async () => {
		// TOCTOU guard: the ready check passed, but the command is still
		// pending when the link drops — withCommandTimeout must reject
		// instead of hanging in ioredis's offline queue. The status flip is
		// synchronous, so it lands before the 50ms deadline fires.
		const { promise: gate } = Promise.withResolvers<never>()
		mockRedisStatus = 'ready'
		const raced = withCommandTimeout(() => gate, 50)
		mockRedisStatus = 'end'
		await expect(raced).rejects.toBeInstanceOf(QueueUnavailableError)
	})

	it('keeps waiting for a pending command while the connection stays ready', async () => {
		// Settling after the start (but before the deadline) proves the race
		// returns the command's result, not the timeout.
		mockRedisStatus = 'ready'
		const { promise, resolve } = Promise.withResolvers<string>()
		const raced = withCommandTimeout(() => promise, 50)
		resolve('ok')
		await expect(raced).resolves.toBe('ok')
	})

	it('runs update-authors jobs through the authors pass', async () => {
		mockSchedulerUpdateAuthors.mockResolvedValueOnce({
			total: 10,
			updated: 8,
			unchanged: 1,
			gone: 1,
			failures: 0
		})
		await expect(handleJob({ name: JOB_NAMES.updateAuthors }, createMockLogger())).resolves.toEqual(
			{
				total: 10,
				updated: 8,
				unchanged: 1,
				gone: 1,
				failures: 0,
				passSkipped: 0
			}
		)
	})

	it('runs update-books jobs through the books pass', async () => {
		mockSchedulerUpdateBooks.mockResolvedValueOnce({
			total: 4,
			updated: 2,
			unchanged: 1,
			gone: 1,
			failures: 0
		})
		await expect(handleJob({ name: JOB_NAMES.updateBooks }, createMockLogger())).resolves.toEqual({
			total: 4,
			updated: 2,
			unchanged: 1,
			gone: 1,
			failures: 0,
			passSkipped: 0
		})
	})

	it('runs update-chapters jobs through the chapters pass', async () => {
		mockSchedulerUpdateChapters.mockResolvedValueOnce({
			total: 6,
			updated: 5,
			unchanged: 1,
			gone: 0,
			failures: 0
		})
		await expect(
			handleJob({ name: JOB_NAMES.updateChapters }, createMockLogger())
		).resolves.toEqual({
			total: 6,
			updated: 5,
			unchanged: 1,
			gone: 0,
			failures: 0,
			passSkipped: 0
		})
	})

	// A PassSummary the in-flight gate resolves to once released.
	const gateSummary = { total: 1, updated: 1, unchanged: 0, gone: 0, failures: 0 }

	it('drops a same-name update occurrence that comes due while the previous run is in flight', async () => {
		// The single-flight guard: a second update-books while update-books is
		// still running must resolve with passSkipped: 1 and never touch the
		// scheduler.
		let release: (() => void) | undefined
		const gate = new Promise<typeof gateSummary>((resolve) => {
			release = () => resolve(gateSummary)
		})
		mockSchedulerUpdateBooks.mockReturnValueOnce(gate)
		const first = handleJob({ name: JOB_NAMES.updateBooks }, createMockLogger())
		// Yield until the first run has registered itself as in-flight.
		await Promise.resolve()
		const second = await handleJob({ name: JOB_NAMES.updateBooks }, createMockLogger())
		expect(second).toEqual({
			total: 0,
			updated: 0,
			unchanged: 0,
			gone: 0,
			failures: 0,
			passSkipped: 1
		})
		release?.()
		await first
		// The second call never invoked the scheduler (only the first did).
		expect(mockSchedulerUpdateBooks).toHaveBeenCalledTimes(1)
	})

	it('lets a different collection run while another is in flight', async () => {
		// The guard is same-name only: update-authors is not excluded by an
		// in-flight update-books (concurrent passes are the point of the split).
		let release: (() => void) | undefined
		const gate = new Promise<typeof gateSummary>((resolve) => {
			release = () => resolve(gateSummary)
		})
		mockSchedulerUpdateBooks.mockReturnValueOnce(gate)
		mockSchedulerUpdateAuthors.mockResolvedValueOnce({
			total: 1,
			updated: 1,
			unchanged: 0,
			gone: 0,
			failures: 0
		})
		const books = handleJob({ name: JOB_NAMES.updateBooks }, createMockLogger())
		await Promise.resolve()
		const authors = await handleJob({ name: JOB_NAMES.updateAuthors }, createMockLogger())
		expect(authors).toEqual({
			total: 1,
			updated: 1,
			unchanged: 0,
			gone: 0,
			failures: 0,
			passSkipped: 0
		})
		release?.()
		await books
		expect(mockSchedulerUpdateAuthors).toHaveBeenCalledTimes(1)
	})

	it('lets a backfill run while an update pass is in flight', async () => {
		// No cross-type exclusion: an accepted backfill has no scheduled re-run,
		// so it must never become a zero-work job because an update is running.
		let release: (() => void) | undefined
		const gate = new Promise<typeof gateSummary>((resolve) => {
			release = () => resolve(gateSummary)
		})
		mockSchedulerUpdateBooks.mockReturnValueOnce(gate)
		mockBackfillProcess.mockResolvedValueOnce({ total: 5, updated: 4, skipped: 1, failed: 0 })
		const books = handleJob({ name: JOB_NAMES.updateBooks }, createMockLogger())
		await Promise.resolve()
		const backfill = await handleJob({ name: JOB_NAMES.backfillRatings }, createMockLogger())
		expect(backfill).toEqual({ total: 5, updated: 4, skipped: 1, failed: 0 })
		release?.()
		await books
		expect(mockBackfillProcess).toHaveBeenCalledTimes(1)
	})

	it('runs backfill-ratings jobs through BookBackfillHelper and logs the summary', async () => {
		const logger = createMockLogger()
		mockBackfillProcess.mockResolvedValueOnce({ total: 5, updated: 4, skipped: 1, failed: 0 })
		// getCacheRedis() is a singleton, so identity-checks the injected
		// client proves the handler wired it in (not null).
		const cache = getCacheRedis()
		await expect(handleJob({ name: 'backfill-ratings' }, logger)).resolves.toEqual({
			total: 5,
			updated: 4,
			skipped: 1,
			failed: 0
		})
		expect(backfillConstructorArgs).toHaveLength(1)
		expect(backfillConstructorArgs[0][1]).toBe(cache)
		expect(logger.info).toHaveBeenCalledTimes(1)
		expect(String(logger.info.mock.calls[0][0])).toContain('Ratings backfill complete')
	})

	it('rejects a still-pending command on a ready connection when the deadline fires', async () => {
		// Absolute deadline: even with the link still "ready", a command that
		// never settles must fail as unavailable instead of hanging.
		mockRedisStatus = 'ready'
		const { promise } = Promise.withResolvers<never>()
		const warnMock = mock(() => {})
		const originalWarn = console.warn
		console.warn = warnMock
		try {
			await expect(withCommandTimeout(() => promise, 50)).rejects.toBeInstanceOf(
				QueueUnavailableError
			)
		} finally {
			console.warn = originalWarn
		}
		expect(warnMock).toHaveBeenCalledTimes(1)
	})

	it('creates one cache connection with bounded retry options', () => {
		redisConstructorCalls.length = 0
		mockRedisStatus = 'end' // force a fresh creation (a previous test may hold a dead singleton)
		const a = getCacheRedis()
		mockRedisStatus = 'ready'
		const b = getCacheRedis()
		expect(a).toBe(b)
		const created = redisConstructorCalls.at(-1)
		expect(created).toBeDefined()
		expect(created?.url).toBe(TEST_REDIS_URL)
		expect(created?.options).toEqual({
			maxRetriesPerRequest: 3,
			commandTimeout: 10000,
			retryStrategy: expect.any(Function)
		})
	})

	it('attaches an error listener to the cache connection', () => {
		// The cache client's retryStrategy never gives up, so a dropped link
		// keeps firing ioredis 'error' events; without a listener those
		// surface as unhandled errors that can kill the process.
		redisConstructorCalls.length = 0
		mockRedisStatus = 'end' // force a fresh creation (a prior test may hold a singleton)
		const a = getCacheRedis()
		mockRedisStatus = 'ready'
		const on = a.on as unknown as Mock
		expect(on).toHaveBeenCalledWith('error', expect.any(Function))
	})

	it('re-creates a dead (end) cache connection', () => {
		redisConstructorCalls.length = 0
		const a = getCacheRedis()
		mockRedisStatus = 'end'
		const b = getCacheRedis()
		expect(b).not.toBe(a)
		// the dead client is explicitly stopped before re-creation, so its
		// retry loop cannot survive as an orphaned connection
		expect(a.disconnect).toHaveBeenCalledTimes(1)
		// the re-created instance also gets the bounded options
		expect(redisConstructorCalls.at(-1)?.options).toEqual({
			maxRetriesPerRequest: 3,
			commandTimeout: 10000,
			retryStrategy: expect.any(Function)
		})
	})

	it('re-creates a dead (end) cache connection even when disconnect throws', () => {
		// The cleanup try/catch around dead.disconnect() is best-effort: an
		// already-disconnected client throws on disconnect, and that must not
		// leak — the singleton is still cleared and re-created.
		redisConstructorCalls.length = 0
		const a = getCacheRedis()
		;(a.disconnect as unknown as Mock).mockImplementation(() => {
			throw new Error('already disconnected')
		})
		mockRedisStatus = 'end'
		const b = getCacheRedis()
		expect(b).not.toBe(a)
		expect(a.disconnect).toHaveBeenCalledTimes(1)
		// the re-created instance also gets the bounded options
		expect(redisConstructorCalls.at(-1)?.options).toEqual({
			maxRetriesPerRequest: 3,
			commandTimeout: 10000,
			retryStrategy: expect.any(Function)
		})
	})

	it('keeps the singleton through a transient (close) status', () => {
		// 'close' is a transient state during ioredis's normal
		// disconnect/reconnect cycle — the client heals in place, so the
		// singleton must be reused and never re-created (that was the
		// orphan-leak bug).
		redisConstructorCalls.length = 0
		const a = getCacheRedis()
		mockRedisStatus = 'close'
		const b = getCacheRedis()
		expect(b).toBe(a)
		expect(a.disconnect).not.toHaveBeenCalled()
	})

	it('uses REDIS_CACHE_URL for the cache connection when configured', () => {
		redisConstructorCalls.length = 0
		process.env.REDIS_CACHE_URL = 'redis://cache.example:6379'
		mockRedisStatus = 'end'
		const cache = getCacheRedis()
		expect(cache).toBeDefined()
		expect(redisConstructorCalls.at(-1)?.url).toBe('redis://cache.example:6379')
		mockRedisStatus = 'ready'
	})

	it('falls back to REDIS_URL for existing external deployments', () => {
		redisConstructorCalls.length = 0
		delete process.env.REDIS_CACHE_URL
		mockRedisStatus = 'end'
		getCacheRedis()
		expect(redisConstructorCalls.at(-1)?.url).toBe(TEST_REDIS_URL)
		mockRedisStatus = 'ready'
	})

	it('throws the cache-specific error when both cache and control URLs are missing', () => {
		mockRedisStatus = 'end' // force the re-create path so the URL is re-read
		delete process.env.REDIS_URL
		delete process.env.REDIS_CACHE_URL
		expect(() => getCacheRedis()).toThrow('REDIS_CACHE_URL or REDIS_URL is required for update cache helpers')
	})

	it('rejects unknown job names', async () => {
		await expect(handleJob({ name: 'nope' }, createMockLogger())).rejects.toThrow(
			'Unknown job name: nope'
		)
	})

	it('subscribes to worker completion and failure events', () => {
		const logger = createMockLogger()
		createWorker(logger)
		const events = mockWorkerOn.mock.calls.map((call) => call[0])
		expect(events).toContain('completed')
		expect(events).toContain('failed')
	})

	it('bounds closeQueue when queue and both Redis clients hang offline, so shutdown continues', async () => {
		const hanging = new Promise<never>(() => {})
		// Ensure all three singletons (queue + both Redis clients) exist so
		// the close exercises every bound close, independent of test order.
		await countBackfillJobsInFlight()
		const queueRedis = getQueueRedis()
		const cacheRedis = getCacheRedis()
		const queueDisconnectsBefore = (queueRedis.disconnect as unknown as Mock).mock.calls.length
		const cacheDisconnectsBefore = (cacheRedis.disconnect as unknown as Mock).mock.calls.length
		// Simulate the offline-blocked shutdown: every close is queued behind
		// a pending command and never settles.
		mockQueueClose.mockReturnValue(hanging)
		mockRedisQuit.mockReturnValue(hanging)
		const started = Date.now()
		// The three per-close deadlines are carved from ONE 600ms budget
		// (remaining budget per close), so the aggregate is ~600ms — not
		// 3 x the per-close bound. A serial sum of the per-close defaults
		// (15s) would exceed this margin by an order of magnitude, so the
		// bound that keeps the Mongo close inside the Docker stop grace is
		// the real assertion; the margin only absorbs scheduling jitter.
		await closeQueue({ budgetMs: 600 })
		expect(Date.now() - started).toBeLessThan(3000)
		// The deadline forced a hard disconnect of both clients instead of
		// waiting on the blocked quit. queueRedis is hit twice: the stuck
		// queue close and the stuck queue-redis quit both fall back to it
		// (the queue rides on the queue-redis connection).
		expect((queueRedis.disconnect as unknown as Mock).mock.calls.length).toBe(queueDisconnectsBefore + 2)
		expect((cacheRedis.disconnect as unknown as Mock).mock.calls.length).toBe(cacheDisconnectsBefore + 1)
		// Singletons are released: shutdown is complete and a re-connection
		// (or the Mongo close in stopServer) is not behind dead clients.
		expect(getQueueRedis()).not.toBe(queueRedis)
		expect(getCacheRedis()).not.toBe(cacheRedis)
		// Leave the close mocks resolving: the hanging stand-ins must not
		// leak into afterAll's closeQueue (each hang would eat a full 5s
		// deadline there).
		mockQueueClose.mockResolvedValue(undefined)
		mockRedisQuit.mockResolvedValue(undefined)
	})

	it('closes cleanly without the fallback when clients settle in time', async () => {
		await countBackfillJobsInFlight()
		const queueRedis = getQueueRedis()
		const cacheRedis = getCacheRedis()
		const queueDisconnectsBefore = (queueRedis.disconnect as unknown as Mock).mock.calls.length
		const cacheDisconnectsBefore = (cacheRedis.disconnect as unknown as Mock).mock.calls.length
		mockQueueClose.mockResolvedValue(undefined)
		mockRedisQuit.mockResolvedValue(undefined)
		await closeQueue()
		// No deadline was hit, so neither client was force-disconnected.
		expect((queueRedis.disconnect as unknown as Mock).mock.calls.length).toBe(queueDisconnectsBefore)
		expect((cacheRedis.disconnect as unknown as Mock).mock.calls.length).toBe(cacheDisconnectsBefore)
		expect(getQueueRedis()).not.toBe(queueRedis)
		expect(getCacheRedis()).not.toBe(cacheRedis)
	})

	it('starts a fresh budget when closeQueue is the first close, so a delayed graceful close does not hit the deadline', async () => {
		// The fresh SHUTDOWN_REDIS_BUDGET_MS branch inside closeQueue
		// covers any caller that reaches it with no (active) budget. An
		// expired budget (startShutdownBudget(0)) is the same state: the
		// branch must start a fresh one. Removing it leaves
		// remainingShutdownBudget() at the 1 ms floor, so each per-close
		// deadline beats even a DELAYED close. This test makes every close
		// delayed-but-graceful (a real 400 ms close, well inside the 9000 ms
		// budget): the fresh-budget code resolves them cleanly; the mutation
		// force-disconnects all three clients on the premature deadline —
		// the same force-disconnect-every-shutdown regression the existing
		// instant-resolved tests cannot catch (a clean close leaves a 9 s
		// budget active, so the expired budget above is what makes the
		// branch — not a leftover from the previous test — the subject).
		// Real wall-clock delays are deliberate here: the point is that the
		// fresh 9000 ms budget (a real platform clock) beats a 400 ms close,
		// so deterministic fake timers cannot substitute.
		// Each close gets its OWN 400 ms delay: a promise resolves once, so
		// sharing one object across the three closes would resolve the
		// second and third immediately and break the elapsed lower bound.
		const closeDelay = () => new Promise<void>((resolve) => setTimeout(resolve, 400))
		const hanging = new Promise<never>(() => {})
		// Expired (0 ms) budget = "no active budget": closeQueue must start
		// its own fresh one. (0 works where an unset budget is not: a clean
		// close earlier in the file leaves a 9 s budget active.)
		startShutdownBudget(0)
		await countBackfillJobsInFlight()
		const queueRedis = getQueueRedis()
		const cacheRedis = getCacheRedis()
		const queueDisconnectsBefore = (queueRedis.disconnect as unknown as Mock).mock.calls.length
		const cacheDisconnectsBefore = (cacheRedis.disconnect as unknown as Mock).mock.calls.length
		// Lazy per-invocation delays: the factory runs when each close
		// actually starts, so the three 400 ms windows run sequentially
		// (eager closeDelay() args would all start at once and overlap,
		// collapsing the elapsed lower bound).
		mockQueueClose.mockImplementationOnce(closeDelay)
		mockRedisQuit
			.mockImplementationOnce(closeDelay) // queue-redis quit
			.mockImplementationOnce(closeDelay) // cache-redis quit
			.mockReturnValue(hanging) // any 4th close hangs: the fresh budget is spent
		const started = Date.now()
		await closeQueue() // no budget started beforehand: closeQueue must start its own
		// Every close won its race inside the fresh budget: no deadline fired,
		// so no force-disconnect (queueRedis's fallback would otherwise hit
		// it twice — the queue close and the queue-redis quit).
		expect((queueRedis.disconnect as unknown as Mock).mock.calls.length).toBe(queueDisconnectsBefore)
		expect((cacheRedis.disconnect as unknown as Mock).mock.calls.length).toBe(cacheDisconnectsBefore)
		// The owned singletons are released exactly once, as a clean close does.
		expect(getQueueRedis()).not.toBe(queueRedis)
		expect(getCacheRedis()).not.toBe(cacheRedis)
		// Sanity: the whole clean close stayed inside the fresh budget with
		// margin, not inside a 0 ms per-close deadline.
		expect(Date.now() - started).toBeGreaterThanOrEqual(3 * 400 - 150)
		expect(Date.now() - started).toBeLessThan(SHUTDOWN_REDIS_BUDGET_MS)
		// Leave the close mocks resolving: the hanging stand-in must not
		// leak into afterAll's closeQueue (it would eat a full 5s deadline).
		mockQueueClose.mockResolvedValue(undefined)
		mockRedisQuit.mockResolvedValue(undefined)
	})

	it('charges a caller-started budget across the queue and rate-limit closes', async () => {
		// Mirrors the API/worker shutdown sequence: the caller starts ONE
		// budget, closeQueue consumes the remainder, and a later close (the
		// rate-limit quit in stopServer) draws from the SAME aggregate — so
		// the two stages cannot each spend a full per-close bound.
		const hanging = new Promise<never>(() => {})
		await countBackfillJobsInFlight()
		mockQueueClose.mockReturnValue(hanging)
		mockRedisQuit.mockReturnValue(hanging)
		startShutdownBudget(600)
		try {
			const started = Date.now()
			await closeQueue() // reuses the caller's budget, no fresh start
			// The rate-limit close gets whatever of the budget is left.
			await closeWithTimeout(
				() => hanging,
				() => {},
				'rate-limit Redis',
				remainingShutdownBudget()
			)
			// The whole sequence (three queue closes + the rate-limit close)
			// is charged against the ONE 600ms budget. If the rate-limit
			// close ignored the budget and took a fresh 5s per-close bound,
			// the sequence would run to ~5.6s and exceed this margin.
			expect(Date.now() - started).toBeLessThan(3000)
		} finally {
			mockQueueClose.mockResolvedValue(undefined)
			mockRedisQuit.mockResolvedValue(undefined)
		}
	})

	it('keeps the aggregate shutdown budget within the 10s Docker stop grace', () => {
		// The budget is the WHOLE close phase (the API charges its HTTP
		// drain + queue/Redis closes + rate-limit quit against it; the
		// worker its BullMQ close + queue closes); it must stay under the
		// default 10s stop grace so the Mongo close (which follows) is
		// reached before SIGKILL. Pin the relationship, not a magic value.
		expect(SHUTDOWN_REDIS_BUDGET_MS).toBeLessThan(10_000)
		expect(SHUTDOWN_REDIS_BUDGET_MS).toBeGreaterThan(0)
	})

	it('charges the stalled HTTP drain and the queue phase against ONE budget, so the Mongo close is reached with ~zero left', async () => {
		// The API stopServer sequence (src/server.ts): startShutdownBudget,
		// closeServerWithTimeout with the remaining budget, then
		// closeQueue({ budgetMs: remainingShutdownBudget() }). A STALLED
		// drain (a request stuck on a dying socket — the unbounded
		// server.close() that once pushed the Mongo close past the 10s
		// Docker stop grace) consumes the whole budget, force-closes the
		// connections, and the queue phase then runs with only the
		// remainder: its forced cleanup lands ~immediately, not on a fresh
		// 9s budget. If the drain did not draw from the shared budget, the
		// sequence would run to 600ms (drain) + 9000ms (queue) and blow
		// this margin by an order of magnitude. Real wall clock, as in
		// the other shutdown-bound tests: the deadlines are real timers.
		const hanging = new Promise<never>(() => {})
		await countBackfillJobsInFlight()
		const queueRedis = getQueueRedis()
		const force = mock()
		startShutdownBudget(600)
		try {
			mockQueueClose.mockReturnValue(hanging)
			mockRedisQuit.mockReturnValue(hanging)
			const started = Date.now()
			// Stalled drain: the listener never closes; the deadline wins
			// and the force-close runs.
			await closeServerWithTimeout(hanging, force, remainingShutdownBudget())
			expect(force).toHaveBeenCalledTimes(1)
			// The queue phase draws the REMAINDER (~0ms floor): with every
			// close hanging, all three forced cleanups land at the floor.
			await closeQueue({ budgetMs: remainingShutdownBudget() })
			expect(Date.now() - started).toBeLessThan(3000)
			// The teardown completed: singletons released, so the Mongo
			// close that follows is not behind dead clients, and the queue
			// phase consumed ~zero of the 10s stop grace.
			expect(getQueueRedis()).not.toBe(queueRedis)
			expect(remainingShutdownBudget()).toBeGreaterThanOrEqual(1)
		} finally {
			mockQueueClose.mockResolvedValue(undefined)
			mockRedisQuit.mockResolvedValue(undefined)
		}
	})

	it('charges every sequential close from one remaining-budget deadline', async () => {
		// Meaningful regression: the aggregate deadline is the budget itself,
		// not N x the per-close bound. With every close hanging, the three
		// remaining-budget deadlines must sum to at most the budget, so a
		// 300ms budget finishes in well under the 3 x per-close default.
		// (A serial implementation would take 3 x 5000ms here.)
		const hanging = new Promise<never>(() => {})
		await countBackfillJobsInFlight()
		mockQueueClose.mockReturnValue(hanging)
		mockRedisQuit.mockReturnValue(hanging)
		try {
			const started = Date.now()
			await closeQueue({ budgetMs: 300 })
			// A serial sum of the per-close defaults (15s) would exceed this
			// by an order of magnitude; the margin only absorbs jitter.
			expect(Date.now() - started).toBeLessThan(3000)
		} finally {
			mockQueueClose.mockResolvedValue(undefined)
			mockRedisQuit.mockResolvedValue(undefined)
		}
		// The remainder drains to the floor (1ms), never negative/zero.
		expect(remainingShutdownBudget()).toBeGreaterThanOrEqual(1)
	})

	it('propagates a pre-deadline close rejection only with propagateRejection', async () => {
		// The worker shutdown relies on this contract: a genuine close
		// FAILURE must abort the remaining teardown, while a hung close is
		// only force-cleaned on the deadline (src/worker.ts). The worker
		// test mocks the helper, so pin the REAL implementation here.
		const fail = new Error('real close failed')
		const fallback = mock()
		await expect(
			closeWithTimeout(
				() => Promise.reject(fail),
				fallback,
				'real close',
				5000,
				{ propagateRejection: true }
			)
		).rejects.toBe(fail)
		expect(fallback).not.toHaveBeenCalled()
		// Default: the rejection is swallowed (Redis quits never meaningfully
		// reject on shutdown), the close resolves, and the deadline fallback
		// is still not needed.
		await closeWithTimeout(() => Promise.reject(fail), fallback, 'real close', 5000)
		expect(fallback).not.toHaveBeenCalled()
	})
})

afterAll(async () => {
	// REDIS_CACHE_URL is restored (not left on the fake cache host): this
	// file's beforeEach/afterEach save and restore it, and afterAll must not
	// leak the fake value into later test files.
	const savedRedisUrl = process.env.REDIS_URL
	const savedRedisCacheUrl = process.env.REDIS_CACHE_URL
	process.env.REDIS_URL = TEST_REDIS_URL
	process.env.REDIS_CACHE_URL = 'redis://cache.example:6379'
	mockRedisStatus = 'end'
	getCacheRedis()
	mockRedisStatus = 'ready'
	// The shutdown-bound tests above nulled the singletons; this lightweight
	// call re-creates the queue (and queue-redis) singleton so the close
	// below exercises all three clients, as it always has.
	await countBackfillJobsInFlight()
	// The shutdown-bound tests above already quit both clients (and
	// mockRedisQuit is never reset between tests), so assert by DELTA: this
	// close alone must quit both independently owned clients.
	const quitsBefore = mockRedisQuit.mock.calls.length
	await closeQueue()
	expect(mockQueueClose).toHaveBeenCalled()
	expect(mockRedisQuit.mock.calls.length).toBe(quitsBefore + 2)
	if (savedRedisUrl === undefined) delete process.env.REDIS_URL
	else process.env.REDIS_URL = savedRedisUrl
	if (savedRedisCacheUrl === undefined) delete process.env.REDIS_CACHE_URL
	else process.env.REDIS_CACHE_URL = savedRedisCacheUrl
	// Hand the real client back last: closeQueue above ran against the
	// mocked clients, and later files in the same bun process must not
	// inherit the ioredis mock.
	mock.module('ioredis', () => ({ Redis: realRedis }))
})
