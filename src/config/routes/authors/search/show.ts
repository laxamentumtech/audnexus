import SharedHelper from '../../../../helpers/shared'
import Author from '../../../models/Author'

async function routes (fastify, options) {
    fastify.get('/authors', async (request, reply) => {
        const asin = request.query.asin
        const name = request.query.name

        if (!name && !asin) {
            throw new Error('No search params provided')
        }

        if (asin) {
            // First, check ASIN validity
            const commonHelpers = new SharedHelper()
            if (!commonHelpers.checkAsinValidity(asin)) {
                throw new Error('Bad ASIN')
            }
            return Promise.resolve(Author.findOne({ asin: asin }))
        }

        // Use regular text search until weighted available:
        // https://github.com/plexinc/papr/issues/98
        if (name) {
            return Promise.resolve(
                Author.find(
                    { $text: { $search: name } },
                    { limit: 25 }
                )
            )
        }
    })
}

export default routes
