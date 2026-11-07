import { FastifyInstance } from 'fastify'

import { HISTORY_REVISION_REGEX, historyDetailQuerySchema } from '#config/bookHistory'
import { AsinSchema } from '#config/types'
import { BadRequestError } from '#helpers/errors/ApiErrors'
import BookHistoryHelper from '#helpers/routes/BookHistoryHelper'
import { MessageBadAsin } from '#static/messages'

const REVISION_SAFE_INTEGER_LIMIT = 9_007_199_254_740_991

/**
 * `GET /books/:asin/history/:revision` — one revision's stored complete
 * delta. The revision number is validated in-handler (positive digits, no
 * leading zeros, safe integer bound); 404 when it does not exist for the
 * exact asin+region pair, 400 for invalid input.
 */
async function _historyDetail(fastify: FastifyInstance) {
	fastify.get('/books/:asin/history/:revision', async (request, reply) => {
		const { asin: asinParam, revision: revisionParam } = request.params as {
			asin: string
			revision: string
		}
		if (!AsinSchema.safeParse(String(asinParam)).success) {
			reply.code(400)
			throw new BadRequestError(MessageBadAsin)
		}
		const asin = AsinSchema.parse(String(asinParam))
		const parsed = historyDetailQuerySchema.safeParse(request.query)
		if (!parsed.success) {
			reply.code(400)
			throw new BadRequestError(`Invalid history detail query: ${parsed.error.message}`)
		}
		if (!HISTORY_REVISION_REGEX.test(String(revisionParam))) {
			reply.code(400)
			throw new BadRequestError(`Invalid history revision: ${revisionParam}`)
		}
		const revisionNumber = Number.parseInt(String(revisionParam), 10)
		if (!Number.isSafeInteger(revisionNumber) || revisionNumber > REVISION_SAFE_INTEGER_LIMIT) {
			reply.code(400)
			throw new BadRequestError(`Invalid history revision: ${revisionParam}`)
		}
		const helper = new BookHistoryHelper(asin, request.log)
		return await helper.getRevision(parsed.data.region, revisionNumber)
	})
}

export default _historyDetail
