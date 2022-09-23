import { FastifyInstance } from 'fastify'

import Author from '#config/models/Author'
import { RequestGenericSearch } from '#config/typing/requests'
import { MessageNoSearchParams } from '#static/messages'

async function _show(fastify: FastifyInstance) {
	fastify.get<RequestGenericSearch>('/authors', async (request, reply) => {
		const name = request.query.name

		if (!name) {
			reply.code(400)
			throw new Error(MessageNoSearchParams)
		}

		// Use projection search from mongo until papr implements it natively.
		// https://github.com/plexinc/papr/issues/98
		if (name) {
			// Find all results of name
			const searchDbByName = await Promise.resolve(
				Author.find(
					{ $text: { $search: name } },
					{
						projection: { _id: 0, asin: 1, name: 1 },
						limit: 25,
						sort: { score: { $meta: 'textScore' } }
					}
				)
			)
			return searchDbByName
		}
	})
}

export default _show
