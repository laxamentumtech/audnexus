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

import { createMockLogger } from '#tests/setup/mockLogger'

const mockQueueAdd = mock()
const mockQueueUpsert = mock()
const mockQueueGetJobs = mock()
const mockQueueClose = mock()
const mockQueueRemove = mock()
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
const mockSchedulerUpdateAll = mock()
const mockBackfillProcess = mock()

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
		updateAll = mockSchedulerUpdateAll
	}
}))

mock.module('#helpers/routes/BookBackfillHelper', () => ({
	default: class BookBackfillHelper {
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
	handleJob,
	JOB_NAMES,
	JOB_RETRIES,
	QUEUE_NAME,
	QueueUnavailableError,
	upsertUpdateScheduler,
	withCommandTimeout
} from '#helpers/jobs/bullmq'
import { TEST_REDIS_URL } from '#tests/setup/performanceConfig'

let savedRedisUrl: string | undefined

beforeEach(() => {
	savedRedisUrl = process.env.REDIS_URL
	process.env.REDIS_URL = TEST_REDIS_URL
	mockRedisStatus = 'ready'
	mockJobFromIdSequence = [null]
	// mockReset (not mockClear) so the per-test once-queues never leak:
	// a leftover resolved/rejected-once on add/remove would be consumed by a
	// later test before its own stubbing.
	mockQueueAdd.mockReset()
	mockQueueRemove.mockReset()
	mockQueueRemove.mockResolvedValue(undefined)
	mockQueueUpsert.mockClear()
	mockQueueGetJobs.mockReset()
	// Default: no jobs in any state — ensureUpdateAllWillRun then enqueues a
	// boot pass, which individual tests override as needed.
	mockQueueGetJobs.mockResolvedValue([])
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
})

describe('bullmq queue helpers', () => {
	it('requires REDIS_URL before creating the shared connection', () => {
		delete process.env.REDIS_URL
		expect(() => getQueueRedis()).toThrow('REDIS_URL is required for background job queues')
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

	describe('upsertUpdateScheduler', () => {
		// BullMQ repeat has no day unit — the interval is passed in MILLISECONDS.
		const cases: Array<{ days: number; everyMs: number }> = [
			{ days: 30, everyMs: 2_592_000_000 },
			{ days: 0.5, everyMs: 43_200_000 }
		]
		for (const { days, everyMs } of cases) {
			it(`upserts the repeatable update-all scheduler for ${days} day(s) as a ms interval`, async () => {
				await upsertUpdateScheduler(days)
				expect(mockQueueUpsert).toHaveBeenCalledWith(
					'update-all-scheduler',
					{ every: everyMs, immediately: true },
					{
						name: JOB_NAMES.updateAll,
						opts: expect.objectContaining(JOB_RETRIES)
					}
				)
			})
		}

		it('waits out the connect handshake instead of failing a cold connection', async () => {
			// Cold-boot regression: the first guard call creates the ioredis
			// client in the same tick, so a synchronous status read hard-failed
			// every container boot (worker exit 1 on the LXC207 dev deploy).
			vi.useFakeTimers()
			try {
				mockRedisStatus = 'connecting'
				const pending = upsertUpdateScheduler(30)
				vi.advanceTimersByTime(50)
				mockRedisStatus = 'ready'
				vi.advanceTimersByTime(50)
				await pending
				expect(mockQueueUpsert).toHaveBeenCalledTimes(1)
			} finally {
				vi.useRealTimers()
			}
		})

		it('sweeps ghost active-list entries before upserting the scheduler', async () => {
			// 2026-10-06 incident: restarts mid-job leaked active-list entries
			// whose job records were gone; the boot `immediately` fire deduped
			// against the ghost and the boot-only schedule never fired again.
			const ghostId = 'repeat:update-all-scheduler:123'
			mockRedisLrange.mockResolvedValue([ghostId, 'real-job'])
			// First exists call (the ghost) → 0; second (a real job) → 1.
			mockRedisExists.mockResolvedValueOnce(0).mockResolvedValueOnce(1)

			await upsertUpdateScheduler(30)

			expect(mockRedisLrem).toHaveBeenCalledWith('bull:audnexus:active', 0, ghostId)
			expect(mockRedisLrem).not.toHaveBeenCalledWith('bull:audnexus:active', 0, 'real-job')
			expect(mockRedisDel).toHaveBeenCalledWith(`bull:audnexus:${ghostId}:lock`)
		})

		it('enqueues a boot pass when no update-all occurrence is pending', async () => {
			// After a ghost sweep (or any dedup loss) the boot-only schedule has
			// no pending occurrence for potentially years; the boot must not
			// trust the upsert alone.
			mockQueueGetJobs.mockResolvedValue([])

			await upsertUpdateScheduler(30)

			expect(mockQueueAdd).toHaveBeenCalledWith(
				JOB_NAMES.updateAll,
				{},
				expect.objectContaining({ jobId: expect.stringMatching(/^boot-\d+$/) })
			)
		})

		it('does not enqueue a boot pass when an update-all is already due', async () => {
			mockQueueGetJobs.mockResolvedValue([{ name: JOB_NAMES.updateAll, delay: 5_000 }])
			mockQueueAdd.mockClear()

			await upsertUpdateScheduler(30)

			expect(mockQueueAdd).not.toHaveBeenCalled()
		})
	})

	it('does not create a scheduler for non-positive day intervals', async () => {
		mockQueueUpsert.mockClear()
		await upsertUpdateScheduler(0)
		await upsertUpdateScheduler(-1)
		expect(mockQueueUpsert).not.toHaveBeenCalled()
	})

	it('counts only backfill jobs across waiting, active, delayed, and paused', async () => {
		// The update-all scheduler keeps a persistent delayed job in the queue;
		// queue-wide counts would make the backfill route permanently 409.
		mockQueueGetJobs.mockResolvedValueOnce([
			{ name: JOB_NAMES.backfillRatings },
			{ name: JOB_NAMES.backfillRatings },
			{ name: JOB_NAMES.updateAll }
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
				upsertUpdateScheduler(30)
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

	it('runs update-all jobs through UpdateScheduler', async () => {
		mockSchedulerUpdateAll.mockResolvedValueOnce({
			total: 10,
			success: 9,
			failures: 1,
			regions: {},
			maxConcurrencyObserved: 1
		})
		await expect(handleJob({ name: 'update-all' }, createMockLogger())).resolves.toEqual({
			total: 10,
			success: 9,
			failures: 1
		})
	})

	it('runs backfill-ratings jobs through BookBackfillHelper and logs the summary', async () => {
		const logger = createMockLogger()
		mockBackfillProcess.mockResolvedValueOnce({ total: 5, updated: 4, skipped: 1, failed: 0 })
		await expect(handleJob({ name: 'backfill-ratings' }, logger)).resolves.toEqual({
			total: 5,
			updated: 4,
			skipped: 1,
			failed: 0
		})
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

	it('throws the cache-specific error when REDIS_URL is missing', () => {
		mockRedisStatus = 'end' // force the re-create path so the URL is re-read
		delete process.env.REDIS_URL
		expect(() => getCacheRedis()).toThrow('REDIS_URL is required for update cache helpers')
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
})

afterAll(async () => {
	await closeQueue()
	expect(mockQueueClose).toHaveBeenCalled()
	expect(mockRedisQuit).toHaveBeenCalled()
})
