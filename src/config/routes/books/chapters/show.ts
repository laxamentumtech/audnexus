import ChapterHelper from '../../../../helpers/audibleChapter'
import SharedHelper from '../../../../helpers/shared'

async function routes (fastify, options) {
    fastify.get('/books/:asin/chapters', async (request, reply) => {
        // First, check ASIN validity
        const commonHelpers = new SharedHelper()
        if (!commonHelpers.checkAsinValidity(request.params.asin)) {
            throw new Error('Bad ASIN')
        }
        const chapApi = new ChapterHelper(request.params.asin)
        return chapApi.fetchBook()
    })
}

export default routes
