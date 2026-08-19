import crypto from 'crypto'
import { FastifyInstance } from 'fastify'

import BookBackfillHelper from '#helpers/routes/BookBackfillHelper'

// In-flight guard: at most one backfill runs per process. Cleared in a
// finally so a failed backfill never wedges subsequent runs.
let backfillInFlight = false

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
		if (backfillInFlight) {
			return reply.code(409).send({ error: 'Conflict', message: 'Backfill already in progress' })
		}
		backfillInFlight = true
		const helper = new BookBackfillHelper(request.log)
		// The backfill can take a long time to finish; return 202 immediately
		// and run it in the background. The summary is logged on completion.
		void helper
			.process()
			.then((summary) => {
				request.log.info({ summary }, 'Ratings backfill complete')
			})
			.catch((err) => {
				request.log.error({ err }, 'Ratings backfill failed')
			})
			.finally(() => {
				backfillInFlight = false
			})
		return reply.code(202).send({ message: 'Ratings backfill started' })
	})
}

export default _backfill
