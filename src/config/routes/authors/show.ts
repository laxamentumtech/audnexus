import { FastifyInstance } from 'fastify'

import { RequestGeneric } from '#config/typing/requests'
import AuthorShowHelper from '#helpers/routes/AuthorShowHelper'
import SharedHelper from '#helpers/utils/shared'
import { MessageBadAsin } from '#static/messages'

async function _show(fastify: FastifyInstance) {
	fastify.get<RequestGeneric>('/authors/:asin', async (request, reply) => {
		const asin = request.params.asin
		// Query params
		const options: RequestGeneric['Querystring'] = {
			update: request.query.update
		}

		// Setup common helper first
		const sharedHelper = new SharedHelper()
		// First, check ASIN validity
		if (!sharedHelper.checkAsinValidity(asin)) {
			reply.code(400)
			throw new Error(MessageBadAsin)
		}

		// Setup Helper
		const { redis } = fastify
		const helper = new AuthorShowHelper(asin, options, redis)

		// Call helper handler
		return helper.handler()
	})
}

export default _show
