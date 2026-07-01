import { FastifyInstance } from 'fastify'

import BookSearchApiHelper from '#helpers/books/audible/BookSearchApiHelper'
import { regions } from '#static/regions'

async function _show(fastify: FastifyInstance) {
	fastify.get('/books/search', async (request, reply) => {
		const { q, region = 'us' } = request.query as { q?: string; region?: string }
		if (!q?.trim()) {
			return reply.code(400).send({ error: 'Bad Request', message: 'q is required' })
		}
		if (!regions[region]) {
			return reply.code(400).send({ error: 'Bad Request', message: `Unknown region: ${region}` })
		}
		const helper = new BookSearchApiHelper(q.trim(), region, request.log)
		return helper.parseResults()
	})
}

export default _show
