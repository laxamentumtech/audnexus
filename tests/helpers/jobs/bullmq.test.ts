import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import { createMockLogger } from '#tests/setup/mockLogger'

const mockQueueAdd = mock()
const mockQueueUpsert = mock()
const mockQueueGetJobCounts = mock()
const mockQueueClose = mock()
const mockRedisQuit = mock()
const mockWorkerClose = mock()
const mockWorkerOn = mock()
const mockSchedulerUpdateAll = mock()
const mockBackfillProcess = mock()

// No real ioredis sockets: CI has no Redis service, and ioredis connects
// eagerly and retries forever, which would keep the test process alive.
mock.module('ioredis', () => ({
	Redis: class {
		quit = mockRedisQuit
	}
}))

mock.module('bullmq', () => ({
	Queue: class {
		add = mockQueueAdd
		upsertJobScheduler = mockQueueUpsert
		getJobCounts = mockQueueGetJobCounts
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
	enqueueUpdateAll,
	getQueueRedis,
	handleJob,
	QUEUE_NAME,
	upsertUpdateScheduler
} from '#helpers/jobs/bullmq'

let savedRedisUrl: string | undefined

beforeEach(() => {
	savedRedisUrl = process.env.REDIS_URL
	process.env.REDIS_URL = 'redis://127.0.0.1:6379'
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

	it('enqueues the update-all job with retry options', async () => {
		mockQueueAdd.mockResolvedValueOnce({ id: 'job-1' })
		await expect(enqueueUpdateAll()).resolves.toBe('job-1')
		expect(mockQueueAdd).toHaveBeenCalledWith(
			'update-all',
			{},
			expect.objectContaining({ attempts: 2, backoff: { type: 'fixed', delay: 300000 } })
		)
	})

	it('enqueues the backfill-ratings job with retry options', async () => {
		mockQueueAdd.mockResolvedValueOnce({ id: 'job-2' })
		await expect(enqueueBackfillRatings()).resolves.toBe('job-2')
		expect(mockQueueAdd).toHaveBeenCalledWith(
			'backfill-ratings',
			{},
			expect.objectContaining({ attempts: 2, backoff: { type: 'fixed', delay: 300000 } })
		)
	})

	it('upserts the repeatable update-all scheduler for positive day intervals', async () => {
		await upsertUpdateScheduler(30)
		expect(mockQueueUpsert).toHaveBeenCalledWith(
			'update-all-scheduler',
			{ every: 2592000, immediately: true },
			{
				name: 'update-all',
				opts: expect.objectContaining({ attempts: 2, backoff: { type: 'fixed', delay: 300000 } })
			}
		)
	})

	it('does not create a scheduler for non-positive day intervals', async () => {
		mockQueueUpsert.mockClear()
		await upsertUpdateScheduler(0)
		await upsertUpdateScheduler(-1)
		expect(mockQueueUpsert).not.toHaveBeenCalled()
	})

	it('counts waiting and active backfill jobs as in-flight', async () => {
		mockQueueGetJobCounts.mockResolvedValueOnce({ waiting: 1, active: 2, completed: 9 })
		await expect(countBackfillJobsInFlight()).resolves.toBe(3)
		expect(mockQueueGetJobCounts).toHaveBeenCalledWith('waiting', 'active')
		mockQueueGetJobCounts.mockResolvedValueOnce({})
		await expect(countBackfillJobsInFlight()).resolves.toBe(0)
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
