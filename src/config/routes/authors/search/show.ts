import Author from '../../../models/Author'
// Search
import { Document } from 'flexsearch'

const document = new Document({
    document: {
        id: 'asin',
        index: [{
            charset: 'latin:simple',
            field: 'name',
            tokenize: 'full'
        }]
    },
    preset: 'score'
})

async function routes (fastify, options) {
    fastify.get('/authors', async (request, reply) => {
        const name = request.query.name

        if (!name) {
            throw new Error('No search params provided')
        }

        // Use projection search from mongo until papr implements it natively.
        // https://github.com/plexinc/papr/issues/98
        if (name) {
            // Find all results of name
            const searchDbByName = await Promise.resolve(
                Author.find(
                    { $text: { $search: name } },
                    { projection: { _id: false, asin: true, name: true }, limit: 25, sort: { score: { $meta: 'textScore' } } },
                )
            )
            // Add results to FlexSearch index
            searchDbByName.forEach(result => {
                document.add(result)
            })
            // Resulting search
            const runFlexSearch = document.search(name)
            if (runFlexSearch.length) {
                const matchedResults = runFlexSearch[0].result as string[]
                // Search documents matched by FlexSearch
                const found = await Promise.resolve(
                    Author.find(
                        { asin: { $in: matchedResults } }
                    )
                )
                if (found) {
                    return found
                }
            }
            return []
        }
    })
}

export default routes
