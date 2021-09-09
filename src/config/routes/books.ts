import ScrapeHelper from '../../helpers/audibleScrape'
import ApiHelper from '../../helpers/audibleApi'
import StitchHelper from '../../helpers/audibleStitch'
import SharedHelper from '../../helpers/shared'
import Book from '../models/Book'

async function routes (fastify, options) {
    fastify.get('/books/:asin', async (request, reply) => {
        const result = await Book.findOne({
            asin: request.params.asin
        })
        if (!result) {
            const commonHelpers = new SharedHelper()
            if (!commonHelpers.checkAsinValidity(request.params.asin)) {
                throw new Error('Bad ASIN')
            }

            const api = new ApiHelper(request.params.asin)
            const scraper = new ScrapeHelper(request.params.asin)

            // Fetch both api and html at same time
            const listOfPromises = [api.fetchBook(), scraper.fetchBook()]
            return await Promise.all(listOfPromises).then(async (res) => {
                const stitch = new StitchHelper(res[0], res[1])
                const item = await Book.insertOne(stitch.process())
                console.log(item)
                reply
                    .code(200)
                    .header('Content-Type', 'application/json; charset=utf-8')
                    .send(item)
            })
        }
        reply
            .code(200)
            .header('Content-Type', 'application/json; charset=utf-8')
            .send(result)
    })
}

export default routes
