import { FastifyInstance } from 'fastify'

import { RequestGeneric } from '#config/typing/requests'
import ChapterDeleteHelper from '#helpers/routes/ChapterDeleteHelper'
import RouteCommonHelper from '#helpers/routes/RouteCommonHelper'
import { MessageDeleted, MessageNotFoundInDb } from '#static/messages'

async function _delete(fastify: FastifyInstance) {
	fastify.delete<RequestGeneric>('/books/:asin/chapters', async (request, reply) => {
		const asin = request.params.asin

		// Setup common helper first
		const routeHelper = new RouteCommonHelper(asin, request.query, reply)
		// Run common helper handler
		const handler = routeHelper.handler()
		// If handler reply code is not 200, return error
		if (handler.reply.statusCode !== 200) return handler.reply

		// Setup helper
		const { redis } = fastify
		const helper = new ChapterDeleteHelper(asin, handler.options, redis, request.log)

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
