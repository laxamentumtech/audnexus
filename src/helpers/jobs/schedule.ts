import type { FastifyBaseLogger } from 'fastify'

import { upsertUpdateScheduler } from '#helpers/jobs/bullmq'

/** The API side of the schedule: (re)create the BullMQ repeatable job.
 * No REDIS_URL → scheduling disabled with a warning (local dev without Redis
 * keeps the API usable; the worker container always has Redis). Redis
 * failures are logged, not fatal — the API serves reads even when scheduled
 * updates are off. */
export async function registerUpdateScheduler(days: number, log: FastifyBaseLogger): Promise<void> {
	if (!process.env.REDIS_URL) {
		log.warn('REDIS_URL not set; scheduled updates and backfill enqueue disabled')
		return
	}
	try {
		await upsertUpdateScheduler(days)
		log.info(`Update scheduler enqueued: every ${days} days`)
	} catch (err) {
		log.error(err, 'Failed to register update scheduler; scheduled updates disabled')
	}
}
