import { FastifyInstance } from 'fastify'

import { requireValidAsin } from '#config/routes/books/historyRouteGuards'
import { ApiQueryString } from '#config/types'
import { RequestGeneric } from '#config/typing/requests'
import BookSimilarHelper from '#helpers/books/audible/BookSimilarHelper'
import { BadRequestError } from '#helpers/errors/ApiErrors'
import RouteCommonHelper from '#helpers/routes/RouteCommonHelper'
import { ErrorMessageBadQuery } from '#static/messages'

// `expand` is only meaningful for this route, so it is validated here
// instead of in the shared ApiQueryStringSchema (which would 400 every
// other route that receives the parameter).
type SimilarQueryString = ApiQueryString & { expand?: 'books' }

async function _similar(fastify: FastifyInstance) {
	fastify.get<RequestGeneric<SimilarQueryString>>(
		'/books/:asin/similar',
		async (request, reply) => {
			// Validate (and normalize) the ASIN before anything else: an
			// empty-after-trim param must 400 here, never reach the common
			// helper's ASIN check or the upstream fetch.
			const asin = requireValidAsin(request.params.asin)

			// Setup common helper first
			const routeHelper = new RouteCommonHelper(asin, request.query, reply)
			// Run common helper handler
			const handler = routeHelper.handler()
			// If handler reply code is not 200, return error
			if (handler.reply.statusCode !== 200) return handler.reply

			// Route-local expand validation: anything other than `books` is a
			// bad query (the shared schema no longer knows this key).
			const rawExpand = request.query.expand
			if (rawExpand !== undefined && rawExpand !== 'books') {
				throw new BadRequestError(ErrorMessageBadQuery('expand'))
			}
			const expand: 'books' | undefined = rawExpand === 'books' ? 'books' : undefined

			// Setup helper
			const helper = new BookSimilarHelper(asin, handler.options.region)
			const similarAsins = await helper.getSimilarAsins()

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
		}
	)
}

export default _similar
