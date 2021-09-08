import { connect, disconnect } from '../papr'
import scrapeHelper from '../../helpers/audibleScrape'
import apiHelper from '../../helpers/audibleApi'
import stitchHelper from '../../helpers/audibleStitch'
import sharedHelper from '../../helpers/shared'
import Book from '../models/Book'

async function routes (fastify, options) {
    fastify.get('/books/:asin', async (request, reply) => {
        await connect()
        const result = await Book.findOne({
            asin: request.params.asin
        })
        if (!result) {
            const commonHelpers = new sharedHelper()
            if (!commonHelpers.checkAsinValidity(request.params.asin)) {
                throw new Error('Bad ASIN')
            }

            const api = new apiHelper(request.params.asin)
            const scraper = new scrapeHelper(request.params.asin)

            // Fetch both api and html at same time
            const listOfPromises = [api.fetchBook(), scraper.fetchBook()]
            return await Promise.all(listOfPromises).then(async (res) => {
                const stitch = new stitchHelper(res[0], res[1])
                const item = await Book.insertOne(stitch.process())
                console.log(item)
                await disconnect()
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
        await disconnect()
    })
}

export default routes
