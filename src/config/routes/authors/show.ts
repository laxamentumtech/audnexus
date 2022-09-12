import { FastifyInstance } from 'fastify'

import { RequestGeneric } from '#config/typing/requests'
import AuthorShowHelper from '#helpers/routes/AuthorShowHelper'
import SharedHelper from '#helpers/utils/shared'

async function _show(fastify: FastifyInstance) {
	fastify.get<RequestGeneric>('/authors/:asin', async (request, reply) => {
		// Query params
		const options: RequestGeneric['Querystring'] = {
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
		const helper = new AuthorShowHelper(request.params.asin, options, redis)

		// Call helper handler
		return helper.handler()
	})
}

export default _show
