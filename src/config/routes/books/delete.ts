import { FastifyInstance } from 'fastify'

import { RequestGeneric, RequestGenericWithSeed } from '#config/typing/requests'
import BookDeleteHelper from '#helpers/routes/BookDeleteHelper'
import SharedHelper from '#helpers/utils/shared'
import {
	MessageBadAsin,
	MessageBadRegion,
	MessageDeleted,
	MessageNotFoundInDb
} from '#static/messages'

async function _delete(fastify: FastifyInstance) {
	fastify.delete<RequestGeneric>('/books/:asin', async (request, reply) => {
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
		const options: RequestGenericWithSeed['Querystring'] = {
			region: region ?? 'us',
			seedAuthors: undefined,
			update: undefined
		}

		// Setup helper
		const { redis } = fastify
		const helper = new BookDeleteHelper(asin, options, redis)

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
