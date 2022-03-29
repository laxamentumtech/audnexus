import SharedHelper from '../../../helpers/shared'
import Book from '../../models/Book'

async function routes (fastify, options) {
    fastify.delete('/books/:asin', async (request, reply) => {
        // First, check ASIN validity
        const commonHelpers = new SharedHelper()
        if (!commonHelpers.checkAsinValidity(request.params.asin)) {
            reply.code(400)
            throw new Error('Bad ASIN')
        }

        const result = await Book.deleteOne({
            asin: request.params.asin
        })
        return result
    })
}

export default routes
