import { Queue, type QueueOptions, Worker, type WorkerOptions } from 'bullmq'
import { Job } from 'bullmq'
// ioredis 5.11.1 is pinned to bullmq's own ioredis version so the shared
// connection type-checks against its connection options.
import type { FastifyBaseLogger } from 'fastify'
import { Redis } from 'ioredis'
import { randomUUID } from 'node:crypto'

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

/** Single shared ioredis connection for all BullMQ machinery. BullMQ requires
 * maxRetriesPerRequest: null (blocking commands), so this connection must only
 * feed BullMQ itself — never the per-item cache helpers (see getCacheRedis).
 * The worker container always sets REDIS_URL; the API server calls these only
 * when REDIS_URL is present. */
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

/** Separate bounded connection for the per-item cache helpers (update/cache
 * path only — BullMQ machinery keeps using getQueueRedis). BullMQ's
 * maxRetriesPerRequest: null would make the cache helpers hang unbounded in
 * ioredis's offline queue when Redis is down, so this one fails instead:
 * bounded retries and a 10s command timeout, so an offline command errors
 * out rather than queueing forever — fail-fast per-command is what makes the
 * job retriable instead of hanging. The retryStrategy never gives up (it
 * always returns a bounded delay), so a short Redis outage heals in place —
 * important because the update pass hands this same instance to
 * UpdateScheduler for hours, and a permanent close would silently break every
 * later cache command. Dead singleton (out-of-band 'end' close) → re-create;
 * see the status check below for the end-only rule. */
let cacheRedis: Redis | null = null
export function getCacheRedis(): Redis {
	// dead singleton (client-initiated 'end' close) → re-create. 'close' is
	// deliberately NOT terminal: it is a transient state during ioredis's
	// normal disconnect/reconnect cycle (the client flips back to
	// 'reconnecting' and heals in place), and clearing the singleton on it
	// would orphan a still-retrying client. 'end' is only reached on a
	// client-initiated close, so the reconnecting path can never land there
	// while retryStrategy is active.
	if (cacheRedis && cacheRedis.status === 'end') {
		const dead = cacheRedis
		try {
			// Explicitly stop the old client so its retry loop cannot keep
			// running as an orphaned connection.
			dead.disconnect()
		} catch {
			// already disconnected; nothing to clean up
		}
		cacheRedis = null
	}
	if (!cacheRedis) {
		if (!process.env.REDIS_URL) {
			throw new Error('REDIS_URL is required for update cache helpers')
		}
		cacheRedis = new Redis(process.env.REDIS_URL, {
			maxRetriesPerRequest: CACHE_MAX_RETRIES_PER_REQUEST,
			commandTimeout: CACHE_COMMAND_TIMEOUT_MS,
			// Never returns null: ioredis must keep reconnecting in place,
			// because the update pass holds this instance for hours.
			retryStrategy: (times) => Math.min(times * CACHE_RETRY_BASE_MS, CACHE_RETRY_CAP_MS)
		})
	}
	return cacheRedis
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

/** How long a guarded BullMQ command may stay pending before we fail it:
 * the ready check above can go stale (TOCTOU) — if the link drops right
 * after the check, the command hangs in ioredis's offline queue, so a
 * still-pending command fails as unavailable instead of hanging. */
export const COMMAND_TIMEOUT_MS = 5000

/** Per-item cache connection tuning (see getCacheRedis). Bounded by design:
 * unlike the BullMQ connection, offline cache commands must error out rather
 * than queue forever in ioredis's offline queue. */
export const CACHE_MAX_RETRIES_PER_REQUEST = 3
export const CACHE_COMMAND_TIMEOUT_MS = 10_000
export const CACHE_RETRY_BASE_MS = 200
export const CACHE_RETRY_CAP_MS = 3000

/** Run a BullMQ command with an absolute deadline: if the command is still
 * pending after `timeoutMs`, reject unconditionally with
 * QueueUnavailableError — even if the connection still reports ready, since
 * a command stuck on a "ready" link waits forever and the caller cannot
 * distinguish that from a healthy queue. A command that settles in time is
 * returned untouched (the timer is cleared). If the command later executes
 * after we rejected, the backfill's deterministic jobId dedup makes the
 * duplicate a no-op. */
export async function withCommandTimeout<T>(
	fn: () => Promise<T>,
	timeoutMs: number = COMMAND_TIMEOUT_MS
): Promise<T> {
	let timer: NodeJS.Timeout
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			console.warn('withCommandTimeout: BullMQ command exceeded deadline, failing as unavailable')
			reject(new QueueUnavailableError())
		}, timeoutMs)
	})
	return Promise.race([fn(), deadline]).finally(() => {
		clearTimeout(timer)
	})
}

/** Deterministic job id for backfill jobs: makes the enqueue idempotent
 * (atomic single-flight) — concurrent adds with the same jobId are deduped
 * by BullMQ's atomic add script, closing the TOCTOU window left by the
 * count-based in-flight check. */
const BACKFILL_JOB_ID = JOB_NAMES.backfillRatings

/** Short-lived Redis lock serializing the remove-then-add backfill critical
 * section across processes (see enqueueBackfillRatings). Ownership: each
 * acquire stores a unique random token as the lock value, and release only
 * deletes the lock when the stored value still equals the holder's token —
 * so a lock that self-expired (holder crashed, or critical section outlived
 * the TTL) can never be deleted out from under a new holder. */
export const BACKFILL_ENQUEUE_LOCK_KEY = `${QUEUE_NAME}:lock:backfill-enqueue`

/** Worst case for the locked critical section: removeTerminatedBackfillJob
 * issues up to 5 sequential withCommandTimeout-guarded commands (Job.fromId,
 * getState, re-read fromId, re-read getState, queue.remove), each of which
 * can hang until its own COMMAND_TIMEOUT_MS deadline, followed by the
 * add — 6 guarded commands in total. Size the TTL to that worst case with
 * a 5s margin; it doubles as the crash backstop (a dead holder's lock
 * self-expires within ~35s and the next enqueue acquires it cleanly). */
export const BACKFILL_ENQUEUE_LOCK_TTL_MS = COMMAND_TIMEOUT_MS * 6 + 5000
const BACKFILL_ENQUEUE_LOCK_ATTEMPTS = 10
const BACKFILL_ENQUEUE_LOCK_RETRY_MS = 100

/** Acquire BACKFILL_ENQUEUE_LOCK_KEY via a short-lived SET NX PX spin.
 * Stores a unique random token as the lock value (the ownership proof used
 * by releaseBackfillEnqueueLock) and returns it; returns null if the
 * bounded spin (10 attempts, 100ms apart) exhausts — a lock held for the
 * full TTL would outlive the spin anyway. */
async function acquireBackfillEnqueueLock(): Promise<string | null> {
	for (let attempt = 0; attempt < BACKFILL_ENQUEUE_LOCK_ATTEMPTS; attempt++) {
		const token = randomUUID()
		const result = await withCommandTimeout(() =>
			getQueueRedis().set(
				BACKFILL_ENQUEUE_LOCK_KEY,
				token,
				'PX',
				BACKFILL_ENQUEUE_LOCK_TTL_MS,
				'NX'
			)
		)
		if (result === 'OK') return token
		await new Promise<void>((resolve) => setTimeout(resolve, BACKFILL_ENQUEUE_LOCK_RETRY_MS))
	}
	return null
}

/** Release the backfill-enqueue lock — but only while still owned: the
 * compare-and-del (GET == token then DEL) ensures a lock that expired and
 * was re-acquired by another holder is never deleted out from under them.
 * The GET-then-DEL is two commands, not an atomic Lua compare-and-del, but
 * the window is harmless here: a stale delete (token match read just before
 * expiry) at worst removes the key a moment before a would-be acquirer
 * would set it, and the token makes a delete of a *different* holder's lock
 * a no-op. Errors are non-fatal (the PX TTL is the backstop). */
async function releaseBackfillEnqueueLock(token: string): Promise<void> {
	try {
		const current = await withCommandTimeout(() => getQueueRedis().get(BACKFILL_ENQUEUE_LOCK_KEY))
		if (current === token) {
			await withCommandTimeout(() => getQueueRedis().del(BACKFILL_ENQUEUE_LOCK_KEY))
		}
	} catch {
		// best effort — the PX TTL is the backstop
	}
}

/** Remove a lingering terminal backfill record before re-enqueueing.
 * removeOnComplete retains the last 100 completed job records, and their
 * hashes stay in Redis — BullMQ's add script treats an add with a jobId
 * whose hash already exists as a no-op duplicate (returns the id, never
 * enqueues), which would silently break the next legitimate backfill.
 * Only terminal records (completed/failed) are removed so the id frees up;
 * in-flight records (waiting/active/delayed/paused) are left alone — the
 * route's 409 guard covers those, and a concurrent slip-through hits the
 * atomic duplicate path on add, which is a safe no-op. The fresh state
 * re-read plus the remove itself are a non-atomic read-then-write pair: a
 * concurrent enqueue between the re-read and the remove would have its
 * freshly waiting job deleted, so that critical section runs under the
 * cross-process backfill-enqueue lock (see enqueueBackfillRatings). */
async function removeTerminatedBackfillJob(): Promise<void> {
	const existing = await withCommandTimeout(() => Job.fromId(getQueue(), BACKFILL_JOB_ID))
	if (!existing) return
	const state = await withCommandTimeout(() => existing.getState())
	if (state !== 'completed' && state !== 'failed') return
	const fresh = await withCommandTimeout(() => Job.fromId(getQueue(), BACKFILL_JOB_ID))
	const freshState = fresh ? await withCommandTimeout(() => fresh.getState()) : null
	if (freshState === 'completed' || freshState === 'failed') {
		await withCommandTimeout(() => getQueue().remove(BACKFILL_JOB_ID))
	}
}

export async function enqueueBackfillRatings(): Promise<string> {
	requireReadyConnection()
	const lockToken = await acquireBackfillEnqueueLock()
	const lockHeld = lockToken !== null
	try {
		// The remove is only safe under the lock: without it, a concurrent
		// enqueue's fresh waiting job could be deleted between the re-read
		// and the remove. Lock-timeout path → plain add; BullMQ's atomic
		// jobId dedup still guarantees single-flight, at the cost of a
		// possibly-stale terminal record blocking this one add — the next
		// backfill cycle frees it.
		if (lockHeld) {
			await removeTerminatedBackfillJob()
		}
		const job = await withCommandTimeout(() =>
			getQueue().add(JOB_NAMES.backfillRatings, {}, { ...JOB_RETRIES, jobId: BACKFILL_JOB_ID })
		)
		return job.id ?? ''
	} finally {
		// Only release a lock we actually took (ownership-checked by token);
		// the TTL covers the rest.
		if (lockHeld) {
			await releaseBackfillEnqueueLock(lockToken)
		}
	}
}

/** Replace the toad-scheduler LongIntervalJob: a BullMQ repeatable job firing
 * every `days` (converted to milliseconds — BullMQ repeat has no day unit).
 * `immediately: true` preserves the old runImmediately behavior.
 * days <= 0 is a no-op (no scheduler created) so local/smoke setups can run
 * the worker without a schedule. */
export async function upsertUpdateScheduler(days: number): Promise<void> {
	const everyMs = Math.floor(days * 86_400_000)
	if (everyMs <= 0) return
	requireReadyConnection()
	// v5.81+ scheduler shape: repeat options take `immediately` (with `every`
	// it fires once at creation and runs every interval); name/data/opts live
	// in the job template.
	await withCommandTimeout(() =>
		getQueue().upsertJobScheduler(
			'update-all-scheduler',
			{ every: everyMs, immediately: true },
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
		const scheduler = new UpdateScheduler(getCacheRedis(), logger)
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
	if (cacheRedis) {
		await cacheRedis.quit()
		cacheRedis = null
	}
}
