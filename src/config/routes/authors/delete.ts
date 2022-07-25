import { FastifyInstance } from 'fastify'

import { RequestGeneric } from '#config/typing/requests'
import { PaprAudibleAuthorHelper } from '#helpers/database/audible'
import { RedisHelper } from '#helpers/database/redis'
import SharedHelper from '#helpers/shared'

async function _delete(fastify: FastifyInstance) {
	fastify.delete<RequestGeneric>('/authors/:asin', async (request, reply) => {
		// Setup common helper first
		const commonHelpers = new SharedHelper()
		// First, check ASIN validity
		if (!commonHelpers.checkAsinValidity(request.params.asin)) {
			reply.code(400)
			throw new Error('Bad ASIN')
		}

		// Setup Helpers
		const paprHelper = new PaprAudibleAuthorHelper(request.params.asin, {})
		const { redis } = fastify
		const redisHelper = new RedisHelper(redis, 'book')

		// Get author from database
		const existingAuthor = await paprHelper.findOne()

		if (!existingAuthor) {
			reply.code(404)
			throw new Error(`${request.params.asin} not found in the database`)
		}

		await redisHelper.deleteKey(request.params.asin)
		return paprHelper.delete()
	})
}

export default _delete
