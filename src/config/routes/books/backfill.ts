import crypto from 'crypto'
import { FastifyInstance } from 'fastify'

import { countBackfillJobsInFlight, enqueueBackfillRatings } from '#helpers/jobs/bullmq'

async function _backfill(fastify: FastifyInstance) {
	fastify.post('/books/backfill-ratings', async (request, reply) => {
		if (process.env.UPDATE_STATS !== '1') {
			return reply.code(404).send({ error: 'Not Found', message: 'Route not available' })
		}
		const adminToken = process.env.ADMIN_TOKEN
		const requestToken = request.headers['x-admin-token']?.toString()
		if (!adminToken || !requestToken) {
			return reply.code(401).send({ error: 'Unauthorized', message: 'Missing admin token' })
		}
		const bufRequest = Buffer.from(requestToken)
		const bufAuth = Buffer.from(adminToken)
		if (bufRequest.length !== bufAuth.length || !crypto.timingSafeEqual(bufRequest, bufAuth)) {
			return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid admin token' })
		}
		if (!process.env.REDIS_URL) {
			return reply
				.code(503)
				.send({ error: 'Service Unavailable', message: 'Backfill requires REDIS_URL' })
		}
		// Durable in-flight guard (queue-level, survives process restarts):
		// waiting covers queued duplicates, active a running pass.
		if ((await countBackfillJobsInFlight()) > 0) {
			return reply.code(409).send({ error: 'Conflict', message: 'Backfill already in progress' })
		}
		const id = await enqueueBackfillRatings()
		return reply.code(202).send({ message: 'Ratings backfill started', id })
	})
}

export default _backfill
