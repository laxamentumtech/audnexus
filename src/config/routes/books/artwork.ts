import { FastifyInstance } from 'fastify'

import { artworkListQuerySchema } from '#config/bookHistory'
import { AsinSchema } from '#config/types'
import { BadRequestError } from '#helpers/errors/ApiErrors'
import BookHistoryHelper from '#helpers/routes/BookHistoryHelper'
import { MessageBadAsin } from '#static/messages'

/**
 * `GET /books/:asin/artwork` — the retained artwork gallery for one exact
 * asin+region pair, newest immutable asset sequence first. Read-only;
 * references only, never fetched image bytes. 200 for an established
 * resource and for a pending trusted current book (empty items); 409 for an
 * unresolved identity conflict; 404 otherwise; 400 for invalid input.
 */
async function _artwork(fastify: FastifyInstance) {
	fastify.get('/books/:asin/artwork', async (request, reply) => {
		const asinParam = String((request.params as { asin: string }).asin)
		if (!AsinSchema.safeParse(asinParam).success) {
			reply.code(400)
			throw new BadRequestError(MessageBadAsin)
		}
		const asin = AsinSchema.parse(asinParam)
		const parsed = artworkListQuerySchema.safeParse(request.query)
		if (!parsed.success) {
			reply.code(400)
			throw new BadRequestError(`Invalid artwork query: ${parsed.error.message}`)
		}
		const helper = new BookHistoryHelper(asin, request.log)
		try {
			return await helper.listArtwork(parsed.data)
		} catch (error) {
			if (error instanceof Error && /^Invalid cursor/.test(error.message)) {
				reply.code(400)
				throw new BadRequestError(`Invalid cursor: ${error.message}`)
			}
			throw error
		}
	})
}

export default _artwork
