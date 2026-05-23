import { mock } from 'bun:test'
import type { MongoClient } from 'mongodb'

export type MockContext = {
	client: Pick<MongoClient, 'db' | 'connect'>
}

export const createMockContext = (): MockContext => {
	return {
		client: {
			db: mock(),
			connect: mock()
		}
	}
}
