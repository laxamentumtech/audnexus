import { mock } from 'bun:test'
import type { MongoClient } from 'mongodb'

export type MockContext = {
	client: Partial<MongoClient>
}

export const createMockContext = (): MockContext => {
	return {
		client: {
			db: mock(),
			connect: mock()
		}
	}
}
