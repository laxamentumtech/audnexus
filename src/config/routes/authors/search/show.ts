import Author from '#models/Author'
import { requestGenericSearch } from '#typing/requests'
import { FastifyInstance } from 'fastify'

async function routes(fastify: FastifyInstance) {
    fastify.get<requestGenericSearch>('/authors', async (request, reply) => {
        const name = request.query.name

        if (!name) {
            reply.code(400)
            throw new Error('No search params provided')
        }

        // Use projection search from mongo until papr implements it natively.
        // https://github.com/plexinc/papr/issues/98
        if (name) {
            // Find all results of name
            const searchDbByName = await Promise.resolve(
                Author.find(
                    { $text: { $search: name } },
                    {
                        projection: { _id: false, asin: true, name: true },
                        limit: 25,
                        sort: { score: { $meta: 'textScore' } }
                    }
                )
            )
            return searchDbByName
        }
    })
}

export default routes
