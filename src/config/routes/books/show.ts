import ScrapeHelper from '../../../helpers/audibleScrape'
import ApiHelper from '../../../helpers/audibleApi'
import StitchHelper from '../../../helpers/audibleStitch'
import ChapterHelper from '../../../helpers/audibleChapter'
import SharedHelper from '../../../helpers/shared'
import Book from '../../models/Book'
import fastJson from 'fast-json-stringify'

async function routes (fastify, options) {
    fastify.get('/books/:asin', async (request, reply) => {
        // First, check ASIN validity
        const commonHelpers = new SharedHelper()
        if (!commonHelpers.checkAsinValidity(request.params.asin)) {
            throw new Error('Bad ASIN')
        }

        const { redis } = fastify
        const findInRedis = await redis.get(request.params.asin, (val) => {
            return JSON.parse(val)
        })
        const findInDb = await Book.findOne({
            asin: request.params.asin
        })
        if (findInRedis) {
            return findInRedis
        } else if (findInDb) {
            redis.set(request.params.asin, fastJson(findInDb))
            return findInDb
        } else {
            // Set up helpers
            const api = new ApiHelper(request.params.asin)
            const chap = new ChapterHelper(request.params.asin)
            const scraper = new ScrapeHelper(request.params.asin)

            // Run fetch tasks in parallel/resolve promises
            const [apiRes, scraperRes, chapRes] = await Promise.all([api.fetchBook(), scraper.fetchBook(), chap.fetchBook()])

            // Run parse tasks in parallel/resolve promises
            const [parseApi, parseScraper, parseChap] = await Promise.all([api.parseResponse(apiRes), scraper.parseResponse(scraperRes), chap.parseResponse(chapRes)])

            const stitch = new StitchHelper(parseApi)
            if (parseScraper !== undefined) {
                stitch.htmlRes = parseScraper
            }
            if (parseChap !== undefined) {
                stitch.tempJson.chapterInfo = parseChap
            }
            const item = await Book.insertOne(stitch.process())
            redis.set(request.params.asin, fastJson(item))
            return item
        }
    })
}

export default routes
