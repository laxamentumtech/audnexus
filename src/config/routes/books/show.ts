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
        // Query params
        const seed = request.query.seedAuthors
        const updateBook = request.query.update

        // First, check ASIN validity
        const commonHelpers = new SharedHelper()
        if (!commonHelpers.checkAsinValidity(request.params.asin)) {
            throw new Error('Bad ASIN')
        }

        const { redis } = fastify
        let findInRedis: string | undefined
        if (redis) {
            findInRedis = await redis.get(`book-${request.params.asin}`, (val: string) => {
                return JSON.parse(val)
            })
        }

        const findInDb = await Promise.resolve(Book.findOne({
            asin: request.params.asin
        }))

        if (updateBook !== '0' && findInRedis) {
            return JSON.parse(findInRedis)
        } else if (updateBook !== '0' && findInDb) {
            if (redis) {
                redis.set(`book-${request.params.asin}`, JSON.stringify(findInDb, null, 2))
            }
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

            let newDbItem: any
            // Update entry or create one
            if (updateBook === '0' && findInDb) {
                // Check state of existing book
                if (findInDb.genres) {
                    // Check state of incoming book
                    if (stichedData.genres) {
                        // Only update if greater data in incoming book
                        if (stichedData.genres.length >= findInDb.genres.length) {
                            console.log(`Updating asin ${request.params.asin}`)
                            Promise.resolve(Book.updateOne({ asin: request.params.asin }, { $set: stichedData }))

                            newDbItem = await Promise.resolve(Book.findOne({ asin: request.params.asin }))
                            if (redis) {
                                redis.set(`book-${request.params.asin}`, JSON.stringify(newDbItem, null, 2))
                            }
                        } else {
                            return findInDb
                        }
                    }
                } else if (stichedData.genres) {
                    // If no genres exist on book, but do on incoming, update
                    Promise.resolve(Book.updateOne({ asin: request.params.asin }, { $set: stichedData }))
                    newDbItem = await Promise.resolve(Book.findOne({ asin: request.params.asin }))
                    redis.set(`book-${request.params.asin}`, JSON.stringify(newDbItem, null, 2))
                }
            } else {
                // Insert stitched data into DB
                newDbItem = await Promise.resolve(Book.insertOne(stichedData))
                if (redis) {
                    redis.set(`book-${request.params.asin}`, JSON.stringify(newDbItem, null, 2))
                }

                // Seed authors in the background
                if (seed !== '0' && newDbItem.authors) {
                    try {
                        newDbItem.authors.map((author, index): any => {
                            if (author && author.asin) {
                                return seedAuthors(author.asin)
                            }
                            return undefined
                        })
                    } catch (err) {
                        console.error(err)
                    }
                }
            }
            return newDbItem
        }
    })
}

export default routes
