import { FastifyInstance } from 'fastify'

import { RequestGeneric } from '#config/typing/requests'
import BookSimilarHelper from '#helpers/books/audible/BookSimilarHelper'
import RouteCommonHelper from '#helpers/routes/RouteCommonHelper'

async function _similar(fastify: FastifyInstance) {
	fastify.get<RequestGeneric>('/books/:asin/similar', async (request, reply) => {
		const asin = request.params.asin

		// Setup common helper first
		const routeHelper = new RouteCommonHelper(asin, request.query, reply)
		// Run common helper handler
		const handler = routeHelper.handler()
		// If handler reply code is not 200, return error
		if (handler.reply.statusCode !== 200) return handler.reply

		// Setup helper
		const helper = new BookSimilarHelper(asin, handler.options.region, request.log)
		const similarAsins = await helper.getSimilarAsins()
		const expand = handler.options.expand

		return {
			asin,
			region: handler.options.region,
			similarAsins,
			expanded: expand === 'books',
			// Empty list short-circuits the bulk fetch.
			...(expand === 'books'
				? { books: similarAsins.length ? await helper.expand(similarAsins) : [] }
				: {})
		}
	})
}

export default _similar
