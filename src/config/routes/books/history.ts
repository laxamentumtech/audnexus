import { FastifyInstance } from 'fastify'

import { historyListQuerySchema } from '#config/bookHistory'
import { guardCursorErrors, requireValidAsin } from '#config/routes/books/historyRouteGuards'
import { BadRequestError } from '#helpers/errors/ApiErrors'
import BookHistoryHelper from '#helpers/routes/BookHistoryHelper'

/**
 * `GET /books/:asin/history` — newest-first page of stored history for one
 * exact asin+region pair. Read-only, served from retained data. 200 for an
 * established resource and for a pending trusted current book (empty
 * items, pending tracking); 409 for an unresolved identity conflict; 404
 * otherwise; 400 for invalid path/query input.
 */
async function _history(fastify: FastifyInstance) {
	fastify.get('/books/:asin/history', async (request, reply) => {
		const asin = requireValidAsin(String((request.params as { asin: string }).asin))
		const parsed = historyListQuerySchema.safeParse(request.query)
		if (!parsed.success) {
			reply.code(400)
			throw new BadRequestError(`Invalid history query: ${parsed.error.message}`)
		}
		const helper = new BookHistoryHelper(asin, request.log)
		// Cursor failures are query-input 400s, not resource 404/409s.
		return await guardCursorErrors(() => helper.listHistory(parsed.data))
	})
}

export default _history
