import { FastifyInstance } from 'fastify'

import { historyListQuerySchema } from '#config/bookHistory'
import { AsinSchema } from '#config/types'
import { BadRequestError } from '#helpers/errors/ApiErrors'
import BookHistoryHelper from '#helpers/routes/BookHistoryHelper'
import { MessageBadAsin } from '#static/messages'

/**
 * `GET /books/:asin/history` — newest-first page of stored history for one
 * exact asin+region pair. Read-only, served from retained data. 200 for an
 * established resource and for a pending trusted current book (empty
 * items, pending tracking); 409 for an unresolved identity conflict; 404
 * otherwise; 400 for invalid path/query input.
 */
async function _history(fastify: FastifyInstance) {
	fastify.get('/books/:asin/history', async (request, reply) => {
		const asinParam = String((request.params as { asin: string }).asin)
		if (!AsinSchema.safeParse(asinParam).success) {
			reply.code(400)
			throw new BadRequestError(MessageBadAsin)
		}
		const asin = AsinSchema.parse(asinParam)
		const parsed = historyListQuerySchema.safeParse(request.query)
		if (!parsed.success) {
			reply.code(400)
			throw new BadRequestError(`Invalid history query: ${parsed.error.message}`)
		}
		const helper = new BookHistoryHelper(asin, request.log)
		try {
			return await helper.listHistory(parsed.data)
		} catch (error) {
			// Cursor failures are query-input 400s, not resource 404/409s.
			if (error instanceof Error && /^Invalid cursor/.test(error.message)) {
				reply.code(400)
				throw new BadRequestError(`Invalid cursor: ${error.message}`)
			}
			throw error
		}
	})
}

export default _history
