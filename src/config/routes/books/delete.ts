import { FastifyInstance } from 'fastify'

import { RequestGeneric } from '#config/typing/requests'
import BookDeleteHelper from '#helpers/routes/BookDeleteHelper'
import SharedHelper from '#helpers/shared'

async function _delete(fastify: FastifyInstance) {
	fastify.delete<RequestGeneric>('/books/:asin', async (request, reply) => {
		// Setup common helper first
		const sharedHelper = new SharedHelper()
		// First, check ASIN validity
		if (!sharedHelper.checkAsinValidity(request.params.asin)) {
			reply.code(400)
			throw new Error('Bad ASIN')
		}

		// Setup helper
		const { redis } = fastify
		const helper = new BookDeleteHelper(request.params.asin, redis)

		// Call helper handler
		const isHandled = await helper.handler()

		if (!isHandled) {
			reply.code(404)
			throw new Error(`${request.params.asin} not found in the database`)
		}

		return { message: `${request.params.asin} deleted` }
	})
}

export default _delete
