import { FastifyRedis } from '@fastify/redis'

import { ApiQueryString } from '#config/types'
import PaprAudibleAuthorHelper from '#helpers/database/papr/audible/PaprAudibleAuthorHelper'
import GenericShowHelper from '#helpers/routes/GenericShowHelper'

export default class AuthorShowHelper extends GenericShowHelper {
	constructor(asin: string, options: ApiQueryString, redis: FastifyRedis | null) {
		super(asin, options, redis, 'author')
	}

	/**
	 * Search for an author in the database by name
	 */
	async getAuthorsByName() {
		// Assert this.paprHelper is PaprAudibleAuthorHelper
		const paprHelper = this.paprHelper as PaprAudibleAuthorHelper
		return (await paprHelper.findByName()).data
	}
}
