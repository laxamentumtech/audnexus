import { FastifyInstance } from 'fastify'

import { RequestGeneric } from '#config/typing/requests'
import ChapterShowHelper from '#helpers/routes/ChapterShowHelper'
import RouteCommonHelper from '#helpers/routes/RouteCommonHelper'
import { MessageNoChapters } from '#static/messages'

async function _show(fastify: FastifyInstance) {
	fastify.get<RequestGeneric>('/books/:asin/chapters', async (request, reply) => {
		const asin = request.params.asin

		// Setup common helper first
		const routeHelper = new RouteCommonHelper(asin, request.query, reply)
		// Run common helper handler
		const handler = routeHelper.handler()
		// If handler reply code is not 200, return error
		if (handler.reply.statusCode !== 200) return handler.reply

		// Setup helper
		const { redis } = fastify
		const helper = new ChapterShowHelper(asin, handler.options, redis, request.log)

		// Call helper handler
		const chapters = await helper.handler()

		// Return 404 if no chapters found
		if (!chapters) {
			reply.code(404)
			throw new Error(MessageNoChapters(asin))
		}

		// Return chapters
		return chapters
	})
}

export default _show
