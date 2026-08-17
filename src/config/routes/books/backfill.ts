import crypto from 'crypto'
import { FastifyInstance } from 'fastify'

import BookBackfillHelper from '#helpers/routes/BookBackfillHelper'

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
		const helper = new BookBackfillHelper(request.log)
		const summary = await helper.process()
		return { message: 'Ratings backfill complete', ...summary }
	})
}

export default _backfill
