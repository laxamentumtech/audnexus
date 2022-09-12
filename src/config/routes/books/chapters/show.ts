import { FastifyInstance } from 'fastify'

import { RequestGeneric } from '#config/typing/requests'
import ChapterShowHelper from '#helpers/routes/ChapterShowHelper'
import SharedHelper from '#helpers/utils/shared'
import { MessageBadAsin, MessageNoChapters } from '#static/messages'

async function _show(fastify: FastifyInstance) {
	fastify.get<RequestGeneric>('/books/:asin/chapters', async (request, reply) => {
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

		// Setup helper
		const { redis } = fastify
		const helper = new ChapterShowHelper(asin, options, redis)

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
