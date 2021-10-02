import ApiHelper from '../../../helpers/books/audibleApi'
import Book from '../../models/Book'
import ScrapeHelper from '../../../helpers/books/audibleScrape'
import SharedHelper from '../../../helpers/shared'
import StitchHelper from '../../../helpers/books/audibleStitch'
import fetch from 'isomorphic-fetch'

/**
 * Calls authors endpoint in the background with ASIN supplied
 * @param {string} ASIN
 */
async function seedAuthors (ASIN: string) {
    fetch('http://localhost:3000/authors/' + ASIN)
}

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

            // Run stitcher and wait for promise to resolve
            const stichedData = await Promise.resolve(stitch.process())
            // Insert stitched data into DB
            const newDbItem = await Promise.resolve(Book.insertOne(stichedData))
            redis.set(`book-${request.params.asin}`, JSON.stringify(newDbItem, null, 2))

            // Seed authors in the background
            if (request.query.seedAuthors !== '0' && newDbItem.authors) {
                try {
                    newDbItem.authors.map((author, index): any => {
                        return seedAuthors(author!.asin!)
                    })
                } catch (err) {
                    console.error(err)
                }
            }
            return newDbItem
        }
    })
}

export default routes
