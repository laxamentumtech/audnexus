import ApiHelper from '#helpers/books/audible/api'
import Book from '#models/Book'
import ScrapeHelper from '#helpers/books/audible/scrape'
import SharedHelper from '#helpers/shared'
import StitchHelper from '#helpers/books/audible/stitch'
import fetch from 'isomorphic-fetch'
import lodash from 'lodash'
import { FastifyInstance } from 'fastify'
import { requestGenericWithSeed } from '#typing/requests'

/**
 * Calls authors endpoint in the background with ASIN supplied
 * @param {string} ASIN
 */
async function seedAuthors(ASIN: string) {
    fetch('http://localhost:3000/authors/' + ASIN)
}

async function routes(fastify: FastifyInstance) {
    fastify.get<requestGenericWithSeed>('/books/:asin', async (request, reply) => {
        // Query params
        const seed = request.query.seedAuthors
        const queryUpdateBook = request.query.update

        // First, check ASIN validity
        const commonHelpers = new SharedHelper()
        if (!commonHelpers.checkAsinValidity(request.params.asin)) {
            reply.code(400)
            throw new Error('Bad ASIN')
        }

        const dbProjection = {
            projection: {
                _id: 0,
                asin: 1,
                authors: 1,
                chapterInfo: 1,
                description: 1,
                formatType: 1,
                genres: 1,
                image: 1,
                language: 1,
                narrators: 1,
                publisherName: 1,
                rating: 1,
                releaseDate: 1,
                runtimeLengthMin: 1,
                seriesPrimary: 1,
                seriesSecondary: 1,
                subtitle: 1,
                summary: 1,
                title: 1
            }
        }

        const { redis } = fastify
        const setRedis = (asin: string, newDbItem: any) => {
            redis.set(`book-${asin}`, JSON.stringify(newDbItem, null, 2))
        }
        let findInRedis: string | null | undefined = undefined
        if (redis) {
            findInRedis = await redis.get(`book-${request.params.asin}`, (_err, val) => {
                if (!val) return undefined
                return JSON.parse(val)
            })
        }

        const findInDb = await Promise.resolve(
            Book.findOne(
                {
                    asin: request.params.asin
                },
                dbProjection
            )
        )

        if (queryUpdateBook !== '0' && findInRedis) {
            return JSON.parse(findInRedis)
        } else if (queryUpdateBook !== '0' && findInDb) {
            if (redis) {
                setRedis(request.params.asin, findInDb)
            }
            return findInDb
        } else {
            // Set up helpers
            const api = new ApiHelper(request.params.asin)
            const scraper = new ScrapeHelper(request.params.asin)

            // Run fetch tasks in parallel/resolve promises
            const [apiRes, scraperRes] = await Promise.all([api.fetchBook(), scraper.fetchBook()])

            // Run parse tasks in parallel/resolve promises
            const [parseApi, parseScraper] = await Promise.all([
                api.parseResponse(apiRes),
                scraper.parseResponse(scraperRes)
            ])

            const stitch = new StitchHelper(parseApi)
            if (parseScraper !== undefined) {
                stitch.htmlRes = parseScraper
            }

            // Run stitcher and wait for promise to resolve
            const stitchedData = await Promise.resolve(stitch.process())

            let newDbItem: any
            const updateBook = async () => {
                Promise.resolve(
                    Book.updateOne({ asin: request.params.asin }, { $set: stitchedData })
                )

                newDbItem = await Promise.resolve(
                    Book.findOne({ asin: request.params.asin }, dbProjection)
                )
                if (redis) {
                    setRedis(request.params.asin, newDbItem)
                }
            }
            // Update entry or create one
            if (queryUpdateBook === '0' && findInDb) {
                // If the objects are the exact same return right away
                if (lodash.isEqual(findInDb, stitchedData)) {
                    return findInDb
                }
                // Check state of existing book
                // Only update if either genres exist and can be checked
                // -or if genres exist on new item but not old
                if (findInDb.genres || (!findInDb.genres && stitchedData.genres)) {
                    // Only update if it's not nuked data
                    if (stitchedData.genres && stitchedData.genres.length) {
                        console.log(`Updating asin ${request.params.asin}`)
                        await updateBook()
                    }
                } else if (stitchedData.genres && stitchedData.genres.length) {
                    // If no genres exist on book, but do on incoming, update
                    console.log(`Updating asin ${request.params.asin}`)
                    await updateBook()
                }
                // No update performed, return original
                return findInDb
            } else {
                // Insert stitched data into DB
                newDbItem = await Promise.resolve(Book.insertOne(stitchedData))
                if (redis) {
                    setRedis(request.params.asin, newDbItem)
                }

                // Seed authors in the background
                if (seed !== '0' && newDbItem.authors) {
                    try {
                        newDbItem.authors.map((author: { asin: string }): any => {
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
