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

if (!process.env.MONGODB_URI) {
	throw new Error('MONGODB_URI is required')
}
if (!process.env.REDIS_URL) {
	throw new Error('REDIS_URL is required')
}
const ctx = createDefaultContext(process.env.MONGODB_URI)

async function main(): Promise<void> {
	await initialize({ client: await ctx.client.connect() })
	// The worker owns the schedule: it creates/refreshes the repeatable
	// update-all job, so the schedule survives API restarts.
	await upsertUpdateScheduler(Number(process.env.UPDATE_INTERVAL) || 30)
	createWorker(logger)
	logger.info(`Worker started on queue ${QUEUE_NAME} (jobs: update-all, backfill-ratings)`)
}

async function shutdown(): Promise<void> {
	logger.info('Shutting down worker...')
	try {
		await getWorker().close()
		await closeQueue()
		await ctx.client.close()
	} finally {
		process.exit(0)
	}
}

process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())

main().catch((err) => {
	logger.error(err)
	process.exit(1)
})
