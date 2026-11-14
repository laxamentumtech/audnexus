import { FastifyRedis } from '@fastify/redis'
import type { FastifyBaseLogger } from 'fastify'

import { ApiQueryString } from '#config/types'
import type { PrefetchedApiProduct } from '#helpers/books/audible/ApiBatchHelper'
import GenericShowHelper from '#helpers/routes/GenericShowHelper'

export default class BookShowHelper extends GenericShowHelper {
	constructor(
		asin: string,
		options: ApiQueryString,
		redis: FastifyRedis | null,
		logger?: FastifyBaseLogger,
		forceUpdate?: boolean,
		skipHtml?: boolean,
		prefetched?: PrefetchedApiProduct,
		reservedGeneration?: number
	) {
		super(
			asin,
			options,
			redis,
			'book',
			logger,
			forceUpdate,
			skipHtml,
			prefetched,
			reservedGeneration
		)
	}
}
