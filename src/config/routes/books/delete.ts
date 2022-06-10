import SharedHelper from '#helpers/shared'
import Book from '#models/Book'
import { FastifyInstance } from 'fastify'
import { requestGeneric } from '#typing/requests'

async function routes(fastify: FastifyInstance) {
    fastify.delete<requestGeneric>('/books/:asin', async (request, reply) => {
        // First, check ASIN validity
        const commonHelpers = new SharedHelper()
        if (!commonHelpers.checkAsinValidity(request.params.asin)) {
            reply.code(400)
            throw new Error('Bad ASIN')
        }

        const findBookByAsin = await Book.findOne({
            asin: request.params.asin
        })

        if (!findBookByAsin) {
            reply.code(404)
            throw new Error('Book not found')
        }

        const result = await Book.deleteOne({
            asin: request.params.asin
        })
        return result
    })
}

export default routes
