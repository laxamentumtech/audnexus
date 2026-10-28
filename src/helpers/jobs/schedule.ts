import type { FastifyBaseLogger } from 'fastify'

import { upsertUpdateScheduler } from '#helpers/jobs/bullmq'

/** The API side of the schedule: (re)create the BullMQ repeatable job.
 * No REDIS_URL → scheduling disabled with a warning (local dev without Redis
 * keeps the API usable; the worker container always has Redis). Redis
 * failures are logged, not fatal — the API serves reads even when scheduled
 * updates are off. */
export async function registerUpdateScheduler(
	days: number,
	logger: FastifyBaseLogger
): Promise<void> {
	if (!process.env.REDIS_URL) {
		logger.warn('REDIS_URL not set; scheduled updates and backfill enqueue disabled')
		return
	}
	try {
		await upsertUpdateScheduler(days)
		logger.info(`Update scheduler enqueued: every ${days} days`)
	} catch (err) {
		logger.error(err, 'Failed to register update scheduler; scheduled updates disabled')
	}
}
