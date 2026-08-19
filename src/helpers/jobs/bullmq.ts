import { Queue, type QueueOptions, Worker, type WorkerOptions } from 'bullmq'
// ioredis 5.11.1 is pinned to bullmq's own ioredis version so the shared
// connection type-checks against its connection options.
import type { FastifyBaseLogger } from 'fastify'
import { Redis } from 'ioredis'

import BookBackfillHelper from '#helpers/routes/BookBackfillHelper'
import UpdateScheduler from '#helpers/utils/UpdateScheduler'

export const QUEUE_NAME = 'audnexus'

export const JOB_NAMES = {
	updateAll: 'update-all',
	backfillRatings: 'backfill-ratings'
} as const
export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES]

/** Jobs are long batch passes; a fixed 5-minute retry is the only sane recovery. */
export const JOB_RETRIES = {
	attempts: 2,
	backoff: { type: 'fixed' as const, delay: 300000 }
} as const

/** Long-running passes must never lose the lock: BullMQ heartbeats the token on
 * every awaited microtask, so a 1h lockDuration only trips on a truly dead worker. */
const WORKER_OPTIONS: Omit<WorkerOptions, 'connection'> = {
	concurrency: 1,
	lockDuration: 3600000,
	stalledInterval: 30000,
	removeOnComplete: { count: 100 },
	removeOnFail: { count: 200 }
}

/** Single shared ioredis connection for all BullMQ machinery and for the
 * per-item cache helpers. The worker container always sets REDIS_URL; the API
 * server calls these only when REDIS_URL is present. */
let queueRedis: Redis | null = null
export function getQueueRedis(): Redis {
	if (!queueRedis) {
		if (!process.env.REDIS_URL) {
			throw new Error('REDIS_URL is required for background job queues')
		}
		queueRedis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
	}
	return queueRedis
}

let queue: Queue | null = null
function getQueue(): Queue {
	if (!queue) {
		const options: QueueOptions = { connection: getQueueRedis() }
		queue = new Queue(QUEUE_NAME, options)
	}
	return queue
}

export async function enqueueUpdateAll(): Promise<string> {
	const job = await getQueue().add(JOB_NAMES.updateAll, {}, { ...JOB_RETRIES })
	return job.id ?? ''
}

export async function enqueueBackfillRatings(): Promise<string> {
	const job = await getQueue().add(JOB_NAMES.backfillRatings, {}, { ...JOB_RETRIES })
	return job.id ?? ''
}

/** Replace the toad-scheduler LongIntervalJob: a BullMQ repeatable job firing
 * every `days` (converted to seconds — BullMQ repeat has no day unit).
 * `immediately: true` preserves the old runImmediately behavior.
 * days <= 0 is a no-op (no scheduler created) so local/smoke setups can run
 * the worker without a schedule. */
export async function upsertUpdateScheduler(days: number): Promise<void> {
	const seconds = Math.floor(days * 86400)
	if (seconds <= 0) return
	// v5.81+ scheduler shape: repeat options take `immediately` (with `every`
	// it fires once at creation and runs every interval); name/data/opts live
	// in the job template.
	await getQueue().upsertJobScheduler(
		'update-all-scheduler',
		{ every: seconds, immediately: true },
		{ name: JOB_NAMES.updateAll, opts: { ...JOB_RETRIES } }
	)
}

/** Durable in-flight check for the backfill route (replaces the in-process
 * boolean guard): waiting covers queued duplicates, active a running pass. */
export async function countBackfillJobsInFlight(): Promise<number> {
	const counts = await getQueue().getJobCounts('waiting', 'active')
	return (counts.waiting ?? 0) + (counts.active ?? 0)
}

/** Single dispatch for both job types — the shared job runner. Each processor
 * returns a summary stored as the BullMQ job result; a thrown error marks the
 * job failed and triggers the fixed 5-minute retry. */
export async function handleJob(
	job: { name: string },
	logger: FastifyBaseLogger
): Promise<Record<string, number>> {
	if (job.name === JOB_NAMES.updateAll) {
		const scheduler = new UpdateScheduler(getQueueRedis(), logger)
		const summary = await scheduler.updateAll()
		return { total: summary.total, success: summary.success, failures: summary.failures }
	}
	if (job.name === JOB_NAMES.backfillRatings) {
		const summary = await new BookBackfillHelper(logger).process()
		logger.info(
			`Ratings backfill complete: total=${summary.total} updated=${summary.updated} skipped=${summary.skipped} failed=${summary.failed}`
		)
		return {
			total: summary.total,
			updated: summary.updated,
			skipped: summary.skipped,
			failed: summary.failed
		}
	}
	throw new Error(`Unknown job name: ${job.name}`)
}

let worker: Worker | null = null
export function createWorker(logger: FastifyBaseLogger): Worker {
	worker = new Worker(QUEUE_NAME, (job) => handleJob(job, logger), {
		...WORKER_OPTIONS,
		connection: getQueueRedis()
	})
	worker.on('completed', (job) => logger.info(`Job ${job.id} (${job.name}) completed`))
	worker.on('failed', (job, err) =>
		logger.error(`Job ${job?.id} (${job?.name}) failed: ${err.message}`)
	)
	return worker
}

export function getWorker(): Worker {
	if (!worker) {
		throw new Error('Worker not created; call createWorker first')
	}
	return worker
}

/** Shutdown only (worker process exit). */
export async function closeQueue(): Promise<void> {
	if (queue) {
		await queue.close()
		queue = null
	}
	if (queueRedis) {
		await queueRedis.quit()
		queueRedis = null
	}
}
