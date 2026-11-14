import type { FastifyBaseLogger } from 'fastify'
import type { MongoClient } from 'mongodb'

import { isBookHistoryEnabled } from '#config/bookHistory'
import { createDefaultContext } from '#config/context'
import { bookHistoryStore, initialize } from '#config/papr'
import {
	closeQueue,
	createWorker,
	getQueueRedisClient,
	getUpdateSchedulerIntervals,
	getWorker,
	QUEUE_NAME,
	upsertUpdateSchedulers
} from '#helpers/jobs/bullmq'
import { setCooldownLogger } from '#helpers/utils/adaptiveCooldown'
import {
	closeWithTimeout,
	remainingShutdownBudget,
	startShutdownBudget
} from '#helpers/utils/shutdownBudget'

// console satisfies the FastifyBaseLogger subset the batch path uses
// (info/debug/error); cast matches the existing CLI convention of passing
// console as the logger.
const logger = console as unknown as FastifyBaseLogger

/** Fail fast on missing required env vars (checked before any connection);
 * returns the validated MONGODB_URI so the caller keeps it narrowed. */
export function validateEnv(): string {
	if (!process.env.MONGODB_URI) {
		throw new Error('MONGODB_URI is required')
	}
	if (!process.env.REDIS_URL) {
		throw new Error('REDIS_URL is required')
	}
	return process.env.MONGODB_URI
}

const ctx = createDefaultContext(validateEnv())

/** The staleness walk sorts on `{ updatedAt: 1, _id: 1 }` over collections as
 * large as `books`; create the backing index idempotently at boot (it is not
 * declared on the papr models, so nothing else builds it). Online build.
 * Targets the same database papr initializes on (`audnexus`) — `client.db()`
 * would select the URI's default database instead, leaving the walk unindexed
 * and creating stray `test.*` collections. */
async function ensureStaleWalkIndexes(client: MongoClient): Promise<void> {
	const db = client.db('audnexus')
	for (const name of ['authors', 'books', 'chapters']) {
		await db.collection(name).createIndex({ updatedAt: 1, _id: 1 }, { name: 'updatedAt_1__id_1' })
	}
}

export async function startWorker(): Promise<void> {
	validateEnv()
	await initialize({ client: await ctx.client.connect() })
	// Activation gate: enabled mode refuses to start without a
	// transaction-capable replica set and prepared history indexes.
	if (isBookHistoryEnabled()) await bookHistoryStore.assertHistoryPrerequisites()
	await ensureStaleWalkIndexes(ctx.client)
	// The worker owns the schedule: it creates/refreshes the repeatable
	// per-collection update jobs, so the schedule survives API restarts.
	await upsertUpdateSchedulers(getUpdateSchedulerIntervals())
	// Surface adaptive-cooldown growth in worker logs (see adaptiveCooldown.ts).
	setCooldownLogger((message) => logger.warn(message))
	createWorker(logger)
	logger.info(
		`Worker started on queue ${QUEUE_NAME} (jobs: update-authors, update-books, update-chapters, backfill-ratings)`
	)
}

let shuttingDown: Promise<void> | null = null

async function doShutdown(): Promise<void> {
	logger.info('Shutting down worker...')
	try {
		// One aggregate wall-clock budget across the Redis-phase closes:
		// the BullMQ worker close and closeQueue each draw from the
		// REMAINING budget, so the sequential closes cannot multiply their
		// per-close deadlines past it. closeQueue receives the remainder
		// explicitly (its budgetMs option): an exhausted deadline would
		// otherwise read as "no budget" and closeQueue would start a
		// fresh one — exactly the case when this worker close consumed
		// the budget by hitting its deadline. The Mongo close runs
		// afterwards with no deadline of its own, so this bounds the
		// Redis phase — not the total teardown.
		startShutdownBudget()
		// BullMQ's close rides on the shared queue Redis connection; if it
		// hangs behind an offline command, hard-disconnecting that connection
		// releases it, and closeQueue then finds the connection already down.
		// The non-creating accessor: a shutdown fallback must not open a new
		// client on its way out. propagateRejection keeps the existing
		// contract: a worker close that genuinely FAILS aborts shutdown (the
		// Mongo close is not run), while a HUNG close is force-cleaned on the
		// deadline and shutdown continues.
		await closeWithTimeout(
			() => getWorker().close(),
			() => getQueueRedisClient()?.disconnect(),
			'worker',
			remainingShutdownBudget(),
			{ propagateRejection: true }
		)
		await closeQueue({ budgetMs: remainingShutdownBudget() })
		await ctx.client.close()
	} finally {
		// Teardown is done (success or failure): clear the single-flight
		// guard so a later call starts fresh. In production process.exit(0)
		// terminates the process immediately after, making the reset
		// unreachable; where exit is stubbed (tests) it lets each call
		// exercise a full teardown.
		shuttingDown = null
		process.exit(0)
	}
}

/** Single-flight entry for the signal handlers: a second SIGTERM/SIGINT
 * during teardown must not re-call the teardown — it would re-arm the
 * shutdown budget and double-close the queue/Redis clients. The in-flight
 * promise is kept (not awaited by the handler) so a failure is logged once
 * and the process exit below still runs. Returns the in-flight promise so
 * callers can await the exact teardown outcome. */
export function shutdown(): Promise<void> {
	if (shuttingDown) return shuttingDown
	shuttingDown = doShutdown()
	shuttingDown.catch((err: unknown) => logger.error(err))
	return shuttingDown
}

export function registerShutdownHandlers(): void {
	process.on('SIGTERM', () => void shutdown())
	process.on('SIGINT', () => void shutdown())
}

// Auto-execution only when running as the worker entry — `bun run worker` →
// `bun run dist/worker.js`, or a direct `bun src/worker.ts`. Importing this
// module (e.g. tests) executes only the env guards and context creation;
// handler registration and startup (registerShutdownHandlers + startWorker)
// run only under the import.meta.main gate, which is false for any module
// that is imported (dynamically-imported modules under bun test included).
if (import.meta.main) {
	registerShutdownHandlers()

	startWorker().catch((err) => {
		logger.error(err)
		process.exit(1)
	})
}
