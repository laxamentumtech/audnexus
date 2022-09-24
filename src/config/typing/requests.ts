import { RequestGenericInterface } from 'fastify'

interface Params {
	asin: string
}

interface Querystring {
	region: string
	update: string | undefined
}

export interface RequestGeneric extends RequestGenericInterface {
	Params: Params
	Querystring: Querystring
}

export interface RequestGenericWithSeed extends RequestGeneric {
	Querystring: {
		seedAuthors: string | undefined
	} & Querystring
}

export interface RequestGenericSearch extends RequestGenericInterface {
	Querystring: {
		name: string | undefined
	} & Querystring
}
