import StitchHelper from '#helpers/books/audible/stitch'
import SharedHelper from '#helpers/shared'
import type { BookDocument } from '#models/Book'
import Book from '#models/Book'
import { requestGenericWithSeed } from '#typing/requests'
import { FastifyInstance } from 'fastify'
import fetch from 'isomorphic-fetch'
import lodash from 'lodash'

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
        const setRedis = (asin: string, newDbItem: BookDocument) => {
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
            const stitchHelper = new StitchHelper(request.params.asin)
            const newBook = await stitchHelper.process()

            // paprCreateBook(newBook)
            let newDbItem: BookDocument | null
            const updateBook = async () => {
                Promise.resolve(Book.updateOne({ asin: request.params.asin }, { $set: newBook }))

                newDbItem = await Promise.resolve(
                    Book.findOne({ asin: request.params.asin }, dbProjection)
                )
                if (redis && newDbItem) {
                    setRedis(request.params.asin, newDbItem)
                }
            }
            // Update entry or create one
            if (queryUpdateBook === '0' && findInDb) {
                // If the objects are the exact same return right away
                if (lodash.isEqual(findInDb, newBook)) {
                    return findInDb
                }
                // Check state of existing book
                // Only update if either genres exist and can be checked
                // -or if genres exist on new item but not old
                if (findInDb.genres || (!findInDb.genres && newBook.genres)) {
                    // Only update if it's not nuked data
                    if (newBook.genres && newBook.genres.length) {
                        console.log(`Updating asin ${request.params.asin}`)
                        await updateBook()
                    }
                } else if (newBook.genres && newBook.genres.length) {
                    // If no genres exist on book, but do on incoming, update
                    console.log(`Updating asin ${request.params.asin}`)
                    await updateBook()
                }
                // No update performed, return original
                return findInDb
            } else {
                // Insert stitched data into DB
                newDbItem = await Promise.resolve(Book.insertOne(newBook))
                if (redis && newDbItem) {
                    setRedis(request.params.asin, newDbItem)
                }

                // Seed authors in the background
                if (seed !== '0' && newDbItem.authors) {
                    try {
                        newDbItem.authors.map((author) => {
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
