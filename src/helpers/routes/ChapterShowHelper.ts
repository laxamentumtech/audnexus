import { FastifyRedis } from '@fastify/redis'

import { ApiQueryString } from '#config/types'
import GenericShowHelper, { ShowHelperOptions } from '#helpers/routes/GenericShowHelper'

export default class ChapterShowHelper extends GenericShowHelper {
	constructor(
		asin: string,
		options: ApiQueryString,
		redis: FastifyRedis | null,
		showOptions: ShowHelperOptions = {}
	) {
		super(asin, options, redis, 'chapter', showOptions)
	}
}
