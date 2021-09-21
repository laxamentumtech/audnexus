import ScrapeHelper from '../../../helpers/audibleScrape'
import ApiHelper from '../../../helpers/audibleApi'
import StitchHelper from '../../../helpers/audibleStitch'
import ChapterHelper from '../../../helpers/audibleChapter'
import SharedHelper from '../../../helpers/shared'
import Book from '../../models/Book'

async function routes (fastify, options) {
    fastify.get('/books/:asin', async (request, reply) => {
        // First, check ASIN validity
        const commonHelpers = new SharedHelper()
        if (!commonHelpers.checkAsinValidity(request.params.asin)) {
            throw new Error('Bad ASIN')
        }

        const findInDb = await Promise.resolve(Book.findOne({
            asin: request.params.asin
        }))

        if (findInDb) {
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
            const stichedData = await Promise.resolve(stitch.process())
            const newDbItem = await Promise.resolve(Book.insertOne(stichedData))
            return newDbItem
        }
    })
}

export default routes
