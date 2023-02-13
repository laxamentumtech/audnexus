import { RequestGenericInterface } from 'fastify'

import { ApiQueryString } from '#config/types'

interface Params {
	asin: string
}

export interface RequestGeneric<T = ApiQueryString> extends RequestGenericInterface {
	Params: Params
	Querystring: T
}
