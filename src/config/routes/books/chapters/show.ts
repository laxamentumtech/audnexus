import ChapterHelper from '#helpers/books/audible/ChapterHelper'
import { PaprAudibleChapterHelper } from '#helpers/database/audible'
import SharedHelper from '#helpers/shared'
import { ApiChapterInterface } from '#interfaces/books'
import { RequestGeneric } from '#config/typing/requests'
import { FastifyInstance } from 'fastify'
import addTimestamps from '#helpers/database/addTimestamps'
import { ChapterDocument } from '#config/models/Chapter'

async function _show(fastify: FastifyInstance) {
    fastify.get<RequestGeneric>('/books/:asin/chapters', async (request, reply) => {
        // Query params
        const options: { update: string | undefined } = {
            update: request.query.update
        }

        // Setup Helpers
        const commonHelpers = new SharedHelper()
        const DbHelper = new PaprAudibleChapterHelper(request.params.asin, options)

        // First, check ASIN validity
        if (!commonHelpers.checkAsinValidity(request.params.asin)) {
            reply.code(400)
            throw new Error('Bad ASIN')
        }

        const { redis } = fastify
        // Set redis k,v function
        const setRedis = (asin: string, newDbItem: ApiChapterInterface) => {
            redis?.set(`chapters-${asin}`, JSON.stringify(newDbItem, null, 2))
        }
        // Search redis if available
        const findInRedis = redis
            ? await redis.get(`chapters-${request.params.asin}`, (_err, val) => {
                  if (!val) return undefined
                  return JSON.parse(val)
              })
            : undefined

        const existingChapter = await DbHelper.findOne()

        // Update option #2
        // Add dates to data if not present
        if (options.update == '2' && existingChapter.data && !existingChapter.data.createdAt) {
            DbHelper.chapterData = addTimestamps(existingChapter.data) as ChapterDocument
            const update = await DbHelper.update()
            return update.data
        }

        // Check for existing or cached data
        if (options.update !== '0' && findInRedis) {
            return JSON.parse(findInRedis)
        } else if (options.update !== '0' && existingChapter.data) {
            setRedis(request.params.asin, existingChapter.data)
            return existingChapter.data
        }

        // Check if the object was updated recently
        if (options.update == '0' && commonHelpers.checkIfRecentlyUpdated(existingChapter.data))
            return existingChapter.data

        // Set up helper
        const chapterHelper = new ChapterHelper(request.params.asin)
        // Request data to be processed by helper
        const chapterData = await chapterHelper.process()
        // Continue only if chapters exist
        if (!chapterData) {
            reply.code(404)
            throw new Error(`No Chapters for ${request.params.asin}`)
        }
        DbHelper.chapterData = chapterData
        // Let CRUD helper decide how to handle the data
        const chapterToReturn = await DbHelper.createOrUpdate()

        // Throw error on null return data
        if (!chapterToReturn.data) {
            throw new Error(`No data returned from database for chapter ${request.params.asin}`)
        }

        // Update Redis if the item is modified
        if (chapterToReturn.modified) {
            setRedis(request.params.asin, chapterToReturn.data)
        }

        return chapterToReturn.data
    })
}

export default _show
