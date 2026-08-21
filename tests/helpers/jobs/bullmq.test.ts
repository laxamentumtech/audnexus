import { afterAll, afterEach, beforeEach, describe, expect, it, type Mock, mock } from 'bun:test'

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
		quit = mockRedisQuit
		disconnect = mock(() => {})
		set = mockRedisSet
		get = mockRedisGet
		del = mockRedisDel
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
	mockQueueAdd.mockClear()
	mockQueueUpsert.mockClear()
	mockQueueGetJobs.mockReset()
	mockQueueRemove.mockClear()
	mockJobFromId.mockClear()
	mockJobFromId.mockImplementation(() => mockJobFromIdSequence.shift() ?? null)
	mockRedisSet.mockReset()
	mockRedisSet.mockResolvedValue('OK')
	mockRedisGet.mockReset()
	mockRedisGet.mockResolvedValue(null)
	mockRedisDel.mockReset()
	mockRedisDel.mockResolvedValue(1)
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
			// (null), so the loser burns its bounded spin (~1s) and falls
			// back to a plain add. Both adds share the deterministic job id,
			// which is what collapses them into exactly ONE active/waiting
			// job in real BullMQ — the lock only serializes the
			// remove+add critical section, dedup guarantees single-flight.
			let setCalls = 0
			let lockedToken: string | null = null
			// Simulate SET NX semantics: the first SET acquires (stores its
			// token), later ones fail; GET returns the stored token so the
			// winner's ownership-checked release (GET == token → DEL) fires.
			mockRedisSet.mockImplementation((_key, token) =>
				Promise.resolve(setCalls++ === 0 ? ((lockedToken = token as string), 'OK') : null)
			)
			mockRedisGet.mockImplementation(() => Promise.resolve(lockedToken))
			mockJobFromIdSequence = [null, null]
			mockQueueAdd.mockResolvedValueOnce({ id: 'job-winner' })
			mockQueueAdd.mockResolvedValueOnce({ id: 'job-loser' })
			const winner = enqueueBackfillRatings()
			const loser = enqueueBackfillRatings()
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
			// the winner's finally verified ownership (GET → its token) and
			// released; the loser never held it
			expect(mockRedisGet).toHaveBeenCalledTimes(1)
			expect(mockRedisGet).toHaveBeenCalledWith(BACKFILL_ENQUEUE_LOCK_KEY)
			expect(mockRedisDel).toHaveBeenCalledTimes(1)
			expect(mockRedisDel).toHaveBeenCalledWith(BACKFILL_ENQUEUE_LOCK_KEY)
		})

		it('releases the lock on the normal path and never re-acquires it', async () => {
			// GET must return the acquired token for the ownership-checked
			// release to delete; a different (or expired) value is a no-op.
			mockRedisSet.mockImplementation((_key, token) => {
				mockRedisGet.mockResolvedValue(token)
				return Promise.resolve('OK')
			})
			mockJobFromIdSequence = [null]
			mockQueueAdd.mockResolvedValueOnce({ id: 'job-x' })
			await expect(enqueueBackfillRatings()).resolves.toBe('job-x')
			expect(mockRedisSet).toHaveBeenCalledTimes(1)
			expect(mockRedisGet).toHaveBeenCalledTimes(1)
			expect(mockRedisDel).toHaveBeenCalledTimes(1)
			expect(mockRedisDel).toHaveBeenCalledWith(BACKFILL_ENQUEUE_LOCK_KEY)
		})

		it('never deletes a lock it does not own (token mismatch on release)', async () => {
			// Simulates the holder's lock self-expiring mid-section and a
			// second holder re-acquiring: the first holder's release GETs a
			// foreign token, so it must NOT del — otherwise it would free
			// the second holder's lock (the race the token prevents).
			mockRedisSet.mockResolvedValue('OK')
			mockRedisGet.mockResolvedValue('someone-elses-token')
			mockJobFromIdSequence = [null]
			mockQueueAdd.mockResolvedValueOnce({ id: 'job-stale' })
			await expect(enqueueBackfillRatings()).resolves.toBe('job-stale')
			expect(mockRedisGet).toHaveBeenCalledTimes(1)
			expect(mockRedisDel).not.toHaveBeenCalled()
		})

		it('serializes a real remove+add: the loser never runs remove, no fresh job deleted', async () => {
			// A terminal (completed) record exists at enqueue time. The
			// first enqueue (the winner) takes the lock, confirms the
			// re-read as completed, removes the terminal record, and
			// adds the fresh waiting job. The second enqueue (the loser)
			// contests the held lock on every spin attempt, exhausts
			// its bounded spin (~1s), and falls back to a plain add —
			// which by design skips the remove entirely. So the freshly
			// added waiting job can never be deleted by the concurrent
			// enqueue's remove, and the remove fires exactly once.
			// Both adds share the deterministic jobId, which real
			// BullMQ's atomic add script dedups into exactly one job
			// (the mock records both adds).
			const completedJob = { getState: () => Promise.resolve('completed') }
			// winner: initial read + re-read; the loser never reads
			// (spin exhausts → plain add skips removeTerminatedBackfillJob)
			mockJobFromIdSequence = [completedJob, completedJob]
			// first SET acquires (winner), every later SET (the loser's
			// spin) is contested; the ownership-checked release GETs its
			// own token, so the DEL fires
			let setCalls = 0
			let acquiredToken = ''
			mockRedisSet.mockImplementation((_key, token) => {
				const acquired = setCalls++ === 0
				if (acquired) acquiredToken = token as string
				return Promise.resolve(acquired ? 'OK' : null)
			})
			// the winner's ownership check GETs its own token → DEL fires
			mockRedisGet.mockImplementation(() => Promise.resolve(acquiredToken))
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
				enqueueBackfillRatings(),
				enqueueBackfillRatings()
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
		})

		it('skips the remove (plain add) and never releases the lock when the lock times out', async () => {
			// All 10 lock attempts fail → bounded spin exhausts → the add
			// proceeds WITHOUT removing: BullMQ's atomic jobId dedup still
			// guarantees single-flight; the lock is not released because we
			// never acquired it.
			mockRedisSet.mockResolvedValue(null)
			mockJobFromIdSequence = [null]
			mockQueueAdd.mockResolvedValueOnce({ id: 'job-timeout' })
			await expect(enqueueBackfillRatings()).resolves.toBe('job-timeout')
			expect(mockQueueRemove).not.toHaveBeenCalled()
			expect(mockQueueAdd).toHaveBeenCalledTimes(1)
			// 10 bounded attempts at ~100ms apart, then give up
			expect(mockRedisSet).toHaveBeenCalledTimes(10)
			expect(mockRedisDel).not.toHaveBeenCalled()
		})

		it('still resolves when the release itself fails (TTL is the backstop)', async () => {
			// The ownership-checked release (GET → DEL) swallows errors by
			// design: the PX TTL is the backstop, so a release failure must
			// never fail the enqueue.
			let acquiredToken = ''
			mockRedisSet.mockImplementation((_key, token) => {
				acquiredToken = token as string
				return Promise.resolve('OK')
			})
			// ownership check passes (GET → own token)...
			mockRedisGet.mockImplementation(() => Promise.resolve(acquiredToken))
			// ...then the DEL rejects during release
			mockRedisDel.mockRejectedValueOnce(new Error('lock release failed'))
			mockJobFromIdSequence = [null]
			mockQueueAdd.mockResolvedValueOnce({ id: 'job-release-fail' })
			await expect(enqueueBackfillRatings()).resolves.toBe('job-release-fail')
			// the add fired and the release attempted (GET → own token → DEL),
			// but the DEL failure did not leak out
			expect(mockRedisGet).toHaveBeenCalledWith(BACKFILL_ENQUEUE_LOCK_KEY)
			expect(mockRedisDel).toHaveBeenCalledTimes(1)
			expect(mockRedisDel).toHaveBeenCalledWith(BACKFILL_ENQUEUE_LOCK_KEY)
		})

		it('releases the lock on the ownership-checked path when the critical section throws', async () => {
			// A terminal record exists; the remove rejects, so the whole
			// enqueue must reject — but the finally must still run the
			// ownership-checked release (GET → own token → DEL).
			const completedJob = { getState: () => Promise.resolve('completed') }
			mockJobFromIdSequence = [completedJob, completedJob]
			// Reset the remove mock: earlier cases leak unconsumed
			// mockResolvedValueOnce entries (they queue one but never call
			// remove), and mockClear() in beforeEach only clears call history,
			// not the once-queue — a leftover resolved-once would be consumed
			// before our reject and mask the throw.
			mockQueueRemove.mockReset()
			let acquiredToken = ''
			mockRedisSet.mockImplementation((_key, token) => {
				acquiredToken = token as string
				return Promise.resolve('OK')
			})
			mockRedisGet.mockImplementation(() => Promise.resolve(acquiredToken))
			mockQueueRemove.mockRejectedValueOnce(new Error('remove boom'))
			mockQueueAdd.mockResolvedValueOnce({ id: 'job-never' })
			await expect(enqueueBackfillRatings()).rejects.toThrow('remove boom')
			// the critical section threw before the add, so no job was enqueued
			expect(mockQueueRemove).toHaveBeenCalledTimes(1)
			expect(mockQueueAdd).not.toHaveBeenCalled()
			// the finally ran the release: ownership verified (GET → own
			// token) and the key deleted
			expect(mockRedisGet).toHaveBeenCalledTimes(1)
			expect(mockRedisGet).toHaveBeenCalledWith(BACKFILL_ENQUEUE_LOCK_KEY)
			expect(mockRedisDel).toHaveBeenCalledTimes(1)
			expect(mockRedisDel).toHaveBeenCalledWith(BACKFILL_ENQUEUE_LOCK_KEY)
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

	it('rejects guarded queue operations when the connection is not ready', async () => {
		mockRedisStatus = 'connecting'
		await expect(enqueueBackfillRatings()).rejects.toBeInstanceOf(QueueUnavailableError)
		await expect(countBackfillJobsInFlight()).rejects.toBeInstanceOf(QueueUnavailableError)
		await expect(upsertUpdateScheduler(30)).rejects.toBeInstanceOf(QueueUnavailableError)
		expect(mockQueueAdd).not.toHaveBeenCalled()
		expect(mockQueueGetJobs).not.toHaveBeenCalled()
		expect(mockQueueUpsert).not.toHaveBeenCalled()
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
