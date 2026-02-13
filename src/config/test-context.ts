import type { DeepMockProxy } from 'jest-mock-extended'
import { mockDeep } from 'jest-mock-extended'
import type { MongoClient } from 'mongodb'

export type MockContext = {
	client: DeepMockProxy<MongoClient>
}

export const createMockContext = (): MockContext => {
	return {
		client: mockDeep<MongoClient>()
	}
}
