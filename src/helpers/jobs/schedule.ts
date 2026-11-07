import type { FastifyBaseLogger } from 'fastify'

import { type UpdateSchedulerIntervals, upsertUpdateSchedulers } from '#helpers/jobs/bullmq'

/** The API side of the schedule: (re)create the BullMQ repeatable jobs.
 * No REDIS_URL → scheduling disabled with a warning (local dev without Redis
 * keeps the API usable; the worker container always has Redis). Redis
 * failures are logged, not fatal — the API serves reads even when scheduled
 * updates are off. The boot passes are deliberately skipped here
 * (`skipBootPass`): the worker owns the schedule and enqueues its own boot
 * pass in `startWorker`, and the API may run many replicas — every replica
 * enqueuing a full boot pass would fan the entire staleness walk out per
 * replica. The API only keeps the repeatable definitions in sync. */
export async function registerUpdateScheduler(
	intervals: UpdateSchedulerIntervals,
	logger: FastifyBaseLogger
): Promise<void> {
	if (!process.env.REDIS_URL) {
		logger.warn('REDIS_URL not set; scheduled updates and backfill enqueue disabled')
		return
	}
	try {
		await upsertUpdateSchedulers(intervals, { skipBootPass: true })
		logger.info(
			`Update schedulers enqueued: authors/books every ${intervals.authors} days, chapters every ${intervals.chapters} days`
		)
	} catch (err) {
		logger.error(err, 'Failed to register update schedulers; scheduled updates disabled')
	}
}
