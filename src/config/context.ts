import { MongoClient } from 'mongodb'

export type Context = {
	client: MongoClient
}

export const createDefaultContext = (uri: string) => {
	return {
		client: new MongoClient(uri)
	}
}
