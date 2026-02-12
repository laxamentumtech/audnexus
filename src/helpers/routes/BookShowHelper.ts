import { FastifyRedis } from '@fastify/redis'
import type { FastifyBaseLogger } from 'fastify'

import { ApiQueryString } from '#config/types'
import GenericShowHelper from '#helpers/routes/GenericShowHelper'

export default class BookShowHelper extends GenericShowHelper {
	constructor(
		asin: string,
		options: ApiQueryString,
		redis: FastifyRedis | null,
		logger?: FastifyBaseLogger
	) {
		super(asin, options, redis, 'book', logger)
	}
}
