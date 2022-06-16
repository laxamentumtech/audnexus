import PaprAudibleHelper from '#helpers/database/audible'
import SharedHelper from '#helpers/shared'
import { requestGeneric } from '#typing/requests'
import { FastifyInstance } from 'fastify'

async function routes(fastify: FastifyInstance) {
    fastify.delete<requestGeneric>('/books/:asin', async (request, reply) => {
        // Setup Helpers
        const commonHelpers = new SharedHelper()
        const DbHelper = new PaprAudibleHelper(request.params.asin, {})

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

        const deletedBook = await DbHelper.delete()
        return deletedBook
    })
}

export default routes
