import { beforeEach, describe, expect, mock, test } from 'bun:test'

// Pin the production client construction option: the strict books validator
// rejects null where a field is typed string, so undefined optionals must be
// OMITTED by the driver (ignoreUndefined), not nulled. The integration suite
// builds its own MongoClient and cannot detect this option being dropped
// from `createDefaultContext` (src/config/context.ts), so the driver is
// mocked here and the construction arguments asserted.
const mockMongoClient = mock()

mock.module('mongodb', () => ({
	MongoClient: mockMongoClient
}))

import { createDefaultContext } from '#config/context'

beforeEach(() => {
	mockMongoClient.mockReset()
})

describe('createDefaultContext', () => {
	test('passes ignoreUndefined: true to the MongoClient', () => {
		createDefaultContext('mongodb://localhost:27017')
		expect(mockMongoClient).toHaveBeenCalledWith('mongodb://localhost:27017', {
			ignoreUndefined: true
		})
	})

	test('returns the constructed client', () => {
		const client = {}
		mockMongoClient.mockReturnValue(client)
		const ctx = createDefaultContext('mongodb://localhost:27017')
		expect(ctx.client).toBe(client)
	})
})
