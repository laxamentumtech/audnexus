import ApiHelper from '../../../helpers/audibleApi'
import Book from '../../models/Book'
import ScrapeHelper from '../../../helpers/audibleScrape'
import SharedHelper from '../../../helpers/shared'
import StitchHelper from '../../../helpers/audibleStitch'

async function routes (fastify, options) {
    fastify.get('/books/:asin', async (request, reply) => {
        // First, check ASIN validity
        const commonHelpers = new SharedHelper()
        if (!commonHelpers.checkAsinValidity(request.params.asin)) {
            throw new Error('Bad ASIN')
        }

        const { redis } = fastify
        const findInRedis = await redis.get(`book-${request.params.asin}`, (val: string) => {
            return JSON.parse(val)
        })
        const findInDb = await Promise.resolve(Book.findOne({
            asin: request.params.asin
        }))

        if (findInRedis) {
            return JSON.parse(findInRedis)
        } else if (findInDb) {
            redis.set(`book-${request.params.asin}`, JSON.stringify(findInDb, null, 2))
            return findInDb
        } else {
            // Set up helpers
            const api = new ApiHelper(request.params.asin)
            const scraper = new ScrapeHelper(request.params.asin)

            // Run fetch tasks in parallel/resolve promises
            const [apiRes, scraperRes] = await Promise.all([api.fetchBook(), scraper.fetchBook()])

            // Run parse tasks in parallel/resolve promises
            const [parseApi, parseScraper] = await Promise.all([api.parseResponse(apiRes), scraper.parseResponse(scraperRes)])

            const stitch = new StitchHelper(parseApi)
            if (parseScraper !== undefined) {
                stitch.htmlRes = parseScraper
            }

            const stichedData = await Promise.resolve(stitch.process())
            const newDbItem = await Promise.resolve(Book.insertOne(stichedData))
            redis.set(`book-${request.params.asin}`, JSON.stringify(newDbItem, null, 2))
            return newDbItem
        }
    })
}

export default routes
