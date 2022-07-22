import { RequestGeneric } from '#config/typing/requests'
import { PaprAudibleBookHelper } from '#helpers/database/audible'
import SharedHelper from '#helpers/shared'
import { FastifyInstance } from 'fastify'

async function _delete(fastify: FastifyInstance) {
	fastify.delete<RequestGeneric>('/books/:asin', async (request, reply) => {
		// Setup Helpers
		const commonHelpers = new SharedHelper()
		const DbHelper = new PaprAudibleBookHelper(request.params.asin, {})

		// First, check ASIN validity
		if (!commonHelpers.checkAsinValidity(request.params.asin)) {
			reply.code(400)
			throw new Error('Bad ASIN')
		}

		const existingBook = await DbHelper.findOne()

		if (!existingBook) {
			reply.code(404)
			throw new Error(`${request.params.asin} not found in the database`)
		}

		return DbHelper.delete()
	})
}

export default _delete
