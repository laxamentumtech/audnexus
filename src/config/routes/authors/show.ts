import ScrapeHelper from '../../../helpers/authors/audibleScrape'
import SharedHelper from '../../../helpers/shared'
import Author from '../../models/Author'

async function routes (fastify, options) {
    fastify.get('/authors/:asin', async (request, reply) => {
        // First, check ASIN validity
        const commonHelpers = new SharedHelper()
        if (!commonHelpers.checkAsinValidity(request.params.asin)) {
            throw new Error('Bad ASIN')
        }

        const { redis } = fastify
        const findInRedis = await redis.get(`author-${request.params.asin}`, (val: string) => {
            return JSON.parse(val)
        })
        const findInDb = await Promise.resolve(Author.findOne({
            asin: request.params.asin
        }))

        if (findInRedis) {
            return JSON.parse(findInRedis)
        } else if (findInDb) {
            redis.set(`author-${request.params.asin}`, JSON.stringify(findInDb, null, 2))
            return findInDb
        } else {
            // Set up helpers
            // const api = new ApiHelper(request.params.asin)
            const scraper = new ScrapeHelper(request.params.asin)

            // Run fetch tasks in parallel/resolve promises
            const [scraperRes] = await Promise.all([scraper.fetchBook()])

            // Run parse tasks in parallel/resolve promises
            const [parseScraper] = await Promise.all([scraper.parseResponse(scraperRes)])

            const newDbItem = await Promise.resolve(Author.insertOne(parseScraper))
            redis.set(`author-${request.params.asin}`, JSON.stringify(newDbItem, null, 2))
            return parseScraper
        }
    })
}

export default routes
