import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import { createMockLogger } from '#tests/setup/mockLogger'

const mockQueueAdd = mock()
const mockQueueUpsert = mock()
const mockQueueGetJobs = mock()
const mockQueueClose = mock()
const mockRedisQuit = mock()
const mockWorkerClose = mock()
const mockWorkerOn = mock()
const mockSchedulerUpdateAll = mock()
const mockBackfillProcess = mock()

// No real ioredis sockets: CI has no Redis service, and ioredis connects
// eagerly and retries forever, which would keep the test process alive.
// `status` reads from `mockRedisStatus` so tests can flip it to exercise the
// non-ready connection paths.
let mockRedisStatus: string = 'ready'

mock.module('ioredis', () => ({
	Redis: class {
		get status() {
			return mockRedisStatus
		}
		quit = mockRedisQuit
	}
}))

mock.module('bullmq', () => ({
	Queue: class {
		add = mockQueueAdd
		upsertJobScheduler = mockQueueUpsert
		getJobs = mockQueueGetJobs
		close = mockQueueClose
	},
	Worker: class {
		close = mockWorkerClose
		on = mockWorkerOn
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
	mockQueueAdd.mockClear()
	mockQueueUpsert.mockClear()
	mockQueueGetJobs.mockReset()
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

	it('enqueues the backfill-ratings job with retry options', async () => {
		mockQueueAdd.mockResolvedValueOnce({ id: 'job-2' })
		await expect(enqueueBackfillRatings()).resolves.toBe('job-2')
		expect(mockQueueAdd).toHaveBeenCalledWith(
			JOB_NAMES.backfillRatings,
			{},
			expect.objectContaining(JOB_RETRIES)
		)
	})

	it('upserts the repeatable update-all scheduler for positive day intervals', async () => {
		await upsertUpdateScheduler(30)
		expect(mockQueueUpsert).toHaveBeenCalledWith(
			'update-all-scheduler',
			{ every: 2592000, immediately: true },
			{
				name: JOB_NAMES.updateAll,
				opts: expect.objectContaining(JOB_RETRIES)
			}
		)
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
