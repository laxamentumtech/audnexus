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

/** Fixed 5-minute retry backoff — jobs are long batch passes; a short retry is pointless. */
export const RETRY_BACKOFF_MS = 300000
/** 1h job lock: BullMQ heartbeats the token on every awaited microtask, so this
 * only trips on a truly dead worker. */
export const LOCK_DURATION_MS = 3600000
/** How often the worker checks for stalled jobs (crashed mid-process). */
export const STALLED_CHECK_INTERVAL_MS = 30000
/** Retention: last N completed/failed job records kept per queue. */
export const RETENTION_COMPLETED = 100
export const RETENTION_FAILED = 200

/** Jobs are long batch passes; a fixed 5-minute retry is the only sane recovery. */
export const JOB_RETRIES = {
	attempts: 2,
	backoff: { type: 'fixed' as const, delay: RETRY_BACKOFF_MS }
} as const

/** Long-running passes must never lose the lock: BullMQ heartbeats the token on
 * every awaited microtask, so a 1h lockDuration only trips on a truly dead worker. */
const WORKER_OPTIONS: Omit<WorkerOptions, 'connection'> = {
	concurrency: 1,
	lockDuration: LOCK_DURATION_MS,
	stalledInterval: STALLED_CHECK_INTERVAL_MS,
	removeOnComplete: { count: RETENTION_COMPLETED },
	removeOnFail: { count: RETENTION_FAILED }
}

/** Thrown by queue helpers when the shared connection is not ready, so callers
 * (e.g. the backfill route) fail fast with 503 instead of hanging on queued
 * ioredis commands. */
export class QueueUnavailableError extends Error {
	constructor() {
		super('Queue unavailable: Redis connection is not ready')
		this.name = 'QueueUnavailableError'
	}
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

/** BullMQ overrides maxRetriesPerRequest to null (blocking commands require
 * it), so with Redis down an ordinary command would queue in ioredis's
 * offline queue and hang forever. Check connection readiness first and fail
 * fast — the backfill route maps this to 503. */
function requireReadyConnection(): void {
	if (getQueueRedis().status !== 'ready') {
		throw new QueueUnavailableError()
	}
}

/** How long a guarded BullMQ command may stay pending before we treat the
 * connection as dead: the ready check above can go stale (TOCTOU) — if the
 * link drops right after the check, the command hangs in ioredis's offline
 * queue, so a still-pending command with a non-ready connection fails as
 * unavailable instead of hanging. */
export const COMMAND_TIMEOUT_MS = 5000

/** Run a BullMQ command with a hard deadline: if the command is still
 * pending after `timeoutMs` and the shared connection is no longer ready,
 * reject with QueueUnavailableError. A command that settles in time is
 * returned untouched (the timer is cleared); with the connection still ready
 * the race simply keeps waiting for the command itself. */
export async function withCommandTimeout<T>(
	fn: () => Promise<T>,
	timeoutMs: number = COMMAND_TIMEOUT_MS
): Promise<T> {
	let timer: NodeJS.Timeout
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			if (getQueueRedis().status !== 'ready') {
				reject(new QueueUnavailableError())
			}
		}, timeoutMs)
	})
	return Promise.race([fn(), deadline]).finally(() => {
		clearTimeout(timer)
	})
}

export async function enqueueBackfillRatings(): Promise<string> {
	requireReadyConnection()
	const job = await withCommandTimeout(() =>
		getQueue().add(JOB_NAMES.backfillRatings, {}, { ...JOB_RETRIES })
	)
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
	requireReadyConnection()
	// v5.81+ scheduler shape: repeat options take `immediately` (with `every`
	// it fires once at creation and runs every interval); name/data/opts live
	// in the job template.
	await withCommandTimeout(() =>
		getQueue().upsertJobScheduler(
			'update-all-scheduler',
			{ every: seconds, immediately: true },
			{ name: JOB_NAMES.updateAll, opts: { ...JOB_RETRIES } }
		)
	)
}

/** Durable in-flight check for the backfill route (replaces the in-process
 * boolean guard). Counts only backfill jobs — the update-all scheduler keeps
 * a persistent delayed job in the queue, so queue-wide counts would make the
 * route permanently 409: waiting covers queued duplicates, active a running
 * pass, delayed a pass between fixed-backoff retries, paused a paused queue. */
export async function countBackfillJobsInFlight(): Promise<number> {
	requireReadyConnection()
	const jobs = await withCommandTimeout(() =>
		getQueue().getJobs(['waiting', 'active', 'delayed', 'paused'])
	)
	return jobs.filter((job) => job.name === JOB_NAMES.backfillRatings).length
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
