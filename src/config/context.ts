import type { DeepMockProxy } from 'jest-mock-extended'
import { mockDeep } from 'jest-mock-extended'
import { MongoClient } from 'mongodb'

export type Context = {
	client: MongoClient
}

export type MockContext = {
	client: DeepMockProxy<MongoClient>
}

export const createMockContext = (): MockContext => {
	return {
		client: mockDeep<MongoClient>()
	}
}

export const createDefaultContext = (uri: string) => {
	return {
		client: new MongoClient(uri)
	}
}
