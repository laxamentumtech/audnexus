import ChapterHelper from '../../../../helpers/books/audibleChapter'
import Chapter from '../../../models/Chapter'
import SharedHelper from '../../../../helpers/shared'

async function routes (fastify, options) {
    fastify.get('/books/:asin/chapters', async (request, reply) => {
        // First, check ASIN validity
        const commonHelpers = new SharedHelper()
        if (!commonHelpers.checkAsinValidity(request.params.asin)) {
            reply.code(400)
            throw new Error('Bad ASIN')
        }

        const { redis } = fastify
        let findInRedis: string | undefined
        if (redis) {
            findInRedis = await redis.get(`chapters-${request.params.asin}`, (val: string) => {
                return JSON.parse(val)
            })
        }

        const findInDb = await Promise.resolve(Chapter.findOne({
            asin: request.params.asin
        }))

        if (findInRedis) {
            return JSON.parse(findInRedis)
        } else if (findInDb) {
            if (redis) {
                redis.set(`chapters-${request.params.asin}`, JSON.stringify(findInDb, null, 2))
            }
            return findInDb
        } else {
            const chapApi = new ChapterHelper(request.params.asin)

            // Run fetch tasks in parallel/resolve promises
            const [chapRes] = await Promise.all([chapApi.fetchBook()])

            // Run parse tasks in parallel/resolve promises
            const [parseChap] = await Promise.all([chapApi.parseResponse(chapRes)])

            if (parseChap !== undefined) {
                const newDbItem = await Promise.resolve(Chapter.insertOne(parseChap))
                if (redis) {
                    redis.set(`chapters-${request.params.asin}`, JSON.stringify(newDbItem, null, 2))
                }
                return newDbItem
            } else {
                reply.code(404)
                throw new Error('No Chapters')
            }
        }
    })
}

export default routes
