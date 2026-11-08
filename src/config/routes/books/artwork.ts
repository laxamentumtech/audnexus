import { FastifyInstance } from 'fastify'

import { artworkListQuerySchema } from '#config/bookHistory'
import { guardCursorErrors, requireValidAsin } from '#config/routes/books/historyRouteGuards'
import { BadRequestError } from '#helpers/errors/ApiErrors'
import BookHistoryHelper from '#helpers/routes/BookHistoryHelper'

/**
 * `GET /books/:asin/artwork` — the retained artwork gallery for one exact
 * asin+region pair, newest immutable asset sequence first. Read-only;
 * references only, never fetched image bytes. 200 for an established
 * resource and for a pending trusted current book (empty items); 409 for an
 * unresolved identity conflict; 404 otherwise; 400 for invalid input.
 */
async function _artwork(fastify: FastifyInstance) {
	fastify.get('/books/:asin/artwork', async (request, reply) => {
		const asin = requireValidAsin(String((request.params as { asin: string }).asin))
		const parsed = artworkListQuerySchema.safeParse(request.query)
		if (!parsed.success) {
			reply.code(400)
			throw new BadRequestError(`Invalid artwork query: ${parsed.error.message}`)
		}
		const helper = new BookHistoryHelper(asin, request.log)
		// Cursor failures are query-input 400s, not resource 404/409s.
		return await guardCursorErrors(() => helper.listArtwork(parsed.data))
	})
}

export default _artwork
