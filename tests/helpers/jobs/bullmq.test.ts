import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import { createMockLogger } from '#tests/setup/mockLogger'

const mockQueueAdd = mock()
const mockQueueUpsert = mock()
const mockQueueGetJobs = mock()
const mockQueueClose = mock()
const mockQueueRemove = mock()
const mockRedisQuit = mock()
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
		// the re-created instance also gets the bounded options
		expect(redisConstructorCalls.at(-1)?.options).toEqual({
			maxRetriesPerRequest: 3,
			commandTimeout: 10000,
			retryStrategy: expect.any(Function)
		})
	})

	it('re-creates a dead (close) cache connection', () => {
		const a = getCacheRedis()
		mockRedisStatus = 'close'
		const b = getCacheRedis()
		expect(b).not.toBe(a)
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
