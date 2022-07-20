import { RequestGenericInterface } from 'fastify'

export interface RequestGeneric extends RequestGenericInterface {
    Querystring: {
        update: string | undefined
    }
    Params: {
        asin: string
    }
}

export interface RequestGenericWithSeed extends RequestGeneric {
    Querystring: {
        seedAuthors: string | undefined
        update: string | undefined
    }
}

export interface RequestGenericSearch extends RequestGenericInterface {
    Querystring: {
        name: string | undefined
    }
}
