import SharedHelper from '../../../../helpers/shared'
import Author from '../../../models/Author'
// Search
import { Document } from 'flexsearch'

const index = new Document({
    document: {
        id: 'asin',
        index: ['name']
    },
    preset: 'score'
})

async function routes (fastify, options) {
    fastify.get('/authors', async (request, reply) => {
        const name = request.query.name

        if (!name) {
            throw new Error('No search params provided')
        }

        // Use regular text search until weighted available:
        // https://github.com/plexinc/papr/issues/98
        if (name) {
            // Find all results of name
            const seardDbByName = await Promise.resolve(
                Author.find(
                    { $text: { $search: name } }
                )
            )
            // Add results to FlexSearch index
            seardDbByName.forEach(result => {
                index.add(result)
            })
            // Resulting search
            const matchedResults = index.search(name)[0].result as string[]
            // Search documents matched by FlexSearch
            const found = await Promise.resolve(
                Author.find(
                    { asin: { $in: matchedResults } }
                )
            )
            return found
        }
    })
}

export default routes
