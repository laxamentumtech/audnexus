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

        if (name) {
            const searchObject = { name: { $regex: name, $options: 'i' } }
            return Promise.resolve(Author.find(searchObject))
        }
    })
}

export default routes
