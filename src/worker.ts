import type { FastifyBaseLogger } from 'fastify'

import { createDefaultContext } from '#config/context'
import { initialize } from '#config/papr'
import {
	closeQueue,
	createWorker,
	getWorker,
	QUEUE_NAME,
	upsertUpdateScheduler
} from '#helpers/jobs/bullmq'

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

export async function startWorker(): Promise<void> {
	validateEnv()
	await initialize({ client: await ctx.client.connect() })
	// The worker owns the schedule: it creates/refreshes the repeatable
	// update-all job, so the schedule survives API restarts.
	await upsertUpdateScheduler(Number(process.env.UPDATE_INTERVAL) || 30)
	createWorker(logger)
	logger.info(`Worker started on queue ${QUEUE_NAME} (jobs: update-all, backfill-ratings)`)
}

export async function shutdown(): Promise<void> {
	logger.info('Shutting down worker...')
	try {
		await getWorker().close()
		await closeQueue()
		await ctx.client.close()
	} finally {
		process.exit(0)
	}
}

export function registerShutdownHandlers(): void {
	process.on('SIGTERM', () => void shutdown())
	process.on('SIGINT', () => void shutdown())
}

// Auto-execution only when running as the worker entry — `bun run worker` →
// `bun run dist/worker.js`, or a direct `bun src/worker.ts`. Importing this
// module (e.g. tests) executes only the env guards and context creation;
// handler registration and startup (registerShutdownHandlers + startWorker)
// run only under the isWorkerEntrypoint gate, which is false on import.
const isWorkerEntrypoint = /worker\.(m?[jt]s)$/.test(process.argv[1] ?? '')
if (isWorkerEntrypoint) {
	registerShutdownHandlers()

	startWorker().catch((err) => {
		logger.error(err)
		process.exit(1)
	})
}
