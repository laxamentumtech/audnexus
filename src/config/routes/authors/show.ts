import { FastifyInstance } from 'fastify'

import { RequestGeneric } from '#config/typing/requests'
import AuthorShowHelper from '#helpers/routes/AuthorShowHelper'
import SharedHelper from '#helpers/utils/shared'
import { MessageBadAsin, MessageBadRegion } from '#static/messages'

async function _show(fastify: FastifyInstance) {
	fastify.get<RequestGeneric>('/authors/:asin', async (request, reply) => {
		const asin = request.params.asin
		const region = request.query.region

		// Setup common helper first
		const sharedHelper = new SharedHelper()
		// First, check ASIN validity
		if (!sharedHelper.checkAsinValidity(asin)) {
			reply.code(400)
			throw new Error(MessageBadAsin)
		}
		// Check region validity
		if (region !== undefined && !sharedHelper.isValidRegion(region)) {
			reply.code(400)
			throw new Error(MessageBadRegion)
		}

		// Query params
		const options: RequestGeneric['Querystring'] = {
			region: region ?? 'us',
			update: request.query.update
		}

		// Setup Helper
		const { redis } = fastify
		const helper = new AuthorShowHelper(asin, options, redis)

		// Call helper handler
		return helper.handler()
	})
}

export default _show
