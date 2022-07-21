import ScrapeHelper from '#helpers/authors/audible/ScrapeHelper'
import { PaprAudibleAuthorHelper } from '#helpers/database/audible'
import SharedHelper from '#helpers/shared'
import type { AuthorDocument } from '#config/models/Author'
import { RequestGeneric } from '#config/typing/requests'
import { FastifyInstance } from 'fastify'
import addTimestamps from '#helpers/database/addTimestamps'

async function _show(fastify: FastifyInstance) {
    fastify.get<RequestGeneric>('/authors/:asin', async (request, reply) => {
        // Query params
        const options: { update: string | undefined } = {
            update: request.query.update
        }

        // Setup Helpers
        const commonHelpers = new SharedHelper()
        const DbHelper = new PaprAudibleAuthorHelper(request.params.asin, options)

        // First, check ASIN validity
        if (!commonHelpers.checkAsinValidity(request.params.asin)) {
            reply.code(400)
            throw new Error('Bad ASIN')
        }

        const { redis } = fastify
        // Set redis k,v function
        const setRedis = (asin: string, newDbItem: AuthorDocument) => {
            redis?.set(`author-${asin}`, JSON.stringify(newDbItem, null, 2))
        }
        // Search redis if available
        const findInRedis = redis
            ? await redis.get(`author-${request.params.asin}`, (_err, val) => {
                  if (!val) return undefined
                  return JSON.parse(val)
              })
            : undefined

        const existingAuthor = await DbHelper.findOne()

        // Update option #2
        // Add dates to data if not present
        if (options.update == '2' && existingAuthor.data && !existingAuthor.data.createdAt) {
            DbHelper.authorData = addTimestamps(existingAuthor.data) as AuthorDocument
            const update = await DbHelper.update()
            return update.data
        }

        // Check for existing or cached data
        if (options.update !== '0' && findInRedis) {
            return JSON.parse(findInRedis)
        } else if (options.update !== '0' && existingAuthor.data) {
            setRedis(request.params.asin, existingAuthor.data)
            return existingAuthor.data
        }

        // Check if the object was updated recently
        if (options.update == '0' && commonHelpers.checkIfRecentlyUpdated(existingAuthor.data))
            return existingAuthor

        // Set up helper
        const scrapeHelper = new ScrapeHelper(request.params.asin)
        // Request data to be processed by helper
        const authorData = await scrapeHelper.process()
        // Pass requested data to the CRUD helper
        DbHelper.authorData = authorData
        // Let CRUD helper decide how to handle the data
        const authorToReturn = await DbHelper.createOrUpdate()

        // Throw error on null return data
        if (!authorToReturn.data) {
            throw new Error(`No data returned from database for author ${request.params.asin}`)
        }

        // Update Redis if the item is modified
        if (authorToReturn.modified) {
            setRedis(request.params.asin, authorToReturn.data)
        }

        return authorToReturn.data
    })
}

export default _show
