import { FastifyInstance } from 'fastify'

import { RequestGeneric } from '#config/typing/requests'
import PaprAudibleBookHelper from '#helpers/database/audible/PaprAudibleBookHelper'
import RedisHelper from '#helpers/database/RedisHelper'
import SharedHelper from '#helpers/shared'

async function _delete(fastify: FastifyInstance) {
	fastify.delete<RequestGeneric>('/books/:asin', async (request, reply) => {
		// Setup common helper first
		const commonHelpers = new SharedHelper()
		// First, check ASIN validity
		if (!commonHelpers.checkAsinValidity(request.params.asin)) {
			reply.code(400)
			throw new Error('Bad ASIN')
		}

		// Setup Helpers
		const paprHelper = new PaprAudibleBookHelper(request.params.asin, {})
		const { redis } = fastify
		const redisHelper = new RedisHelper(redis, 'book', request.params.asin)

		// Get book from database
		const existingBook = await paprHelper.findOne()

		if (!existingBook) {
			reply.code(404)
			throw new Error(`${request.params.asin} not found in the database`)
		}

		await redisHelper.deleteOne()
		return paprHelper.delete()
	})
}

export default _delete
