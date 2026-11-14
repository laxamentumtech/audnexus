import { MongoClient } from 'mongodb'

export type Context = {
	client: MongoClient
}

export const createDefaultContext = (uri: string) => {
	return {
		// Undefined optional fields (e.g. an absent subtitle) must be omitted
		// from writes, not serialized as null: the books validator types those
		// fields as strings and rejects a null with 'Document failed
		// validation'.
		client: new MongoClient(uri, { ignoreUndefined: true })
	}
}
