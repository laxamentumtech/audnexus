import { FastifyInstance } from 'fastify'

import { RequestGenericWithSeed } from '#config/typing/requests'
import BookShowHelper from '#helpers/routes/BookShowHelper'
import SharedHelper from '#helpers/shared'

async function _show(fastify: FastifyInstance) {
	fastify.get<RequestGenericWithSeed>('/books/:asin', async (request, reply) => {
		// Query params
		const options: RequestGenericWithSeed['Querystring'] = {
			seedAuthors: request.query.seedAuthors,
			update: request.query.update
		}

		// Setup common helper first
		const sharedHelper = new SharedHelper()
		// First, check ASIN validity
		if (!sharedHelper.checkAsinValidity(request.params.asin)) {
			reply.code(400)
			throw new Error('Bad ASIN')
		}

		// Setup Helper
		const { redis } = fastify
		const helper = new BookShowHelper(request.params.asin, options, redis)

		// Call helper handler
		return helper.handler()
	})
}

export default _show
