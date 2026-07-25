import { FastifyInstance } from 'fastify'

import { RequestGeneric } from '#config/typing/requests'
import AuthorShowHelper from '#helpers/routes/AuthorShowHelper'
import RouteCommonHelper from '#helpers/routes/RouteCommonHelper'

async function _show(fastify: FastifyInstance) {
	fastify.get<RequestGeneric>('/authors/:asin', async (request, reply) => {
		const asin = request.params.asin

		// Setup common helper first
		const routeHelper = new RouteCommonHelper(asin, request.query, reply)
		// Run common helper handler
		const handler = routeHelper.handler()
		// If handler reply code is not 200, return error
		if (handler.reply.statusCode !== 200) return handler.reply

		// Setup Helper
		const { redis } = fastify
		const helper = new AuthorShowHelper(asin, handler.options, redis, request.log)

		// Call helper handler
		return helper.handler()
	})
}

export default _show
