import SharedHelper from '#helpers/shared'
import Author from '#models/Author'
import { FastifyInstance } from 'fastify'
import { requestGeneric } from '#typing/requests'

async function routes(fastify: FastifyInstance) {
    fastify.delete<requestGeneric>('/authors/:asin', async (request, reply) => {
        // First, check ASIN validity
        const commonHelpers = new SharedHelper()
        if (!commonHelpers.checkAsinValidity(request.params.asin)) {
            reply.code(400)
            throw new Error('Bad ASIN')
        }

        const findAuthorByAsin = await Author.findOne({
            asin: request.params.asin
        })

        if (!findAuthorByAsin) {
            reply.code(404)
            throw new Error('Author not found')
        }

        const result = await Author.deleteOne({
            asin: request.params.asin
        })
        return result
    })
}

export default routes
