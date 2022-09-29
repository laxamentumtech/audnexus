import { RequestGenericInterface } from 'fastify'

interface Params {
	asin: string
}

interface Querystring {
	name?: string
	region?: string
	seedAuthors?: string
	update?: string
}

export interface RequestGeneric<T = Querystring> extends RequestGenericInterface {
	Params: Params
	Querystring: T
}
