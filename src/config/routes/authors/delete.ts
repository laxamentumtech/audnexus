import { FastifyInstance } from 'fastify'

import { RequestGeneric } from '#config/typing/requests'
import AuthorDeleteHelper from '#helpers/routes/AuthorDeleteHelper'
import SharedHelper from '#helpers/utils/shared'
import { MessageBadAsin, MessageDeleted, MessageNotFoundInDb } from '#static/messages'

async function _delete(fastify: FastifyInstance) {
	fastify.delete<RequestGeneric>('/authors/:asin', async (request, reply) => {
		const asin = request.params.asin
		// Setup common helper first
		const sharedHelper = new SharedHelper()
		// First, check ASIN validity
		if (!sharedHelper.checkAsinValidity(asin)) {
			reply.code(400)
			throw new Error(MessageBadAsin)
		}

		// Setup helper
		const { redis } = fastify
		const helper = new AuthorDeleteHelper(asin, redis)

		// Call helper handler
		const isHandled = await helper.handler()

		if (!isHandled) {
			reply.code(404)
			throw new Error(MessageNotFoundInDb(asin))
		}

		return { message: MessageDeleted(asin) }
	})
}

export default _delete
