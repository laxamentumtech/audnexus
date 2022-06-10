import { RequestGenericInterface } from 'fastify'

export interface requestGeneric extends RequestGenericInterface {
    Querystring: {
        update: string | undefined
    }
    Params: {
        asin: string
    }
}

export interface requestGenericWithSeed extends requestGeneric {
    Querystring: {
        seedAuthors: string | undefined
        update: string | undefined
    }
}

export interface requestGenericSearch extends RequestGenericInterface {
    Querystring: {
        name: string | undefined
    }
}