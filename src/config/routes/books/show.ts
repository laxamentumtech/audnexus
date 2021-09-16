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

        // Next, try and find it in DB
        const result = await Book.findOne({
            asin: request.params.asin
        })
        if (!result) {
            const api = new ApiHelper(request.params.asin)
            const chap = new ChapterHelper(request.params.asin)
            const scraper = new ScrapeHelper(request.params.asin)

            // Fetch both api and html at same time
            // as const because https://stackoverflow.com/a/62895959/15412097
            const listOfPromises = [api.parseResponse(await api.fetchBook()), scraper.fetchBook(), chap.parseResponse(await chap.fetchBook())] as const
            return await Promise.all(listOfPromises).then(async (res) => {
                const stitch = new StitchHelper(res[0])
                if (res[1] !== undefined) {
                    stitch.htmlRes = res[1]
                }
                if (res[2] !== undefined) {
                    stitch.tempJson.chapterInfo = res[2]
                }
                const item = await Book.insertOne(stitch.process())
                return item
            })
        }
        return result
    })
}

export default routes
