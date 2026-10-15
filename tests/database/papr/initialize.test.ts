mock.module('mongodb', () => {
	return {
		MongoClient: mock().mockImplementation(() => ({
			connect: mock().mockResolvedValue(undefined),
			db: mock().mockReturnValue({
				collection: mock().mockReturnValue({ createIndex: mock() })
			}),
			close: mock().mockResolvedValue(undefined)
		}))
	}
})
import { beforeEach, describe, expect, type Mock,mock, spyOn, test } from 'bun:test'
import { Db } from 'mongodb'

import { Context, createDefaultContext } from '#config/context'
import { initialize } from '#config/papr'
import { createMockContext, MockContext } from '#config/test-context'

let mockCtx: MockContext
let ctx: Context
let mockCreateIndex: Mock

beforeEach(() => {
	mockCtx = createMockContext()
	ctx = mockCtx as unknown as Context
	mockCreateIndex = mock()
	const mockDbInstance = {
		collection: mock().mockReturnValue({ createIndex: mockCreateIndex })
	} as unknown as Db
	spyOn(ctx.client, 'db').mockReturnValue(mockDbInstance)
	spyOn(ctx.client, 'connect').mockResolvedValue(ctx.client)
})

describe('Papr should', () => {
	test('initialize with mock', async () => {
		await expect(initialize(ctx)).resolves.toBeUndefined()
		expect(ctx.client.db).toHaveBeenCalledWith('audnexus')
		// Text index on name backs the $text search in PaprAudibleAuthorHelper.findByName
		expect(mockCreateIndex).toHaveBeenCalledWith({ name: 'text' })
	})
	test('initialize with mock client via createDefaultContext', async () => {
		ctx = createDefaultContext('mongodb://localhost:27017')
		// Verify initialize works when called via createDefaultContext (mongodb module is mocked)
		await expect(initialize(ctx)).resolves.toBeUndefined()
		expect(ctx.client.db).toHaveBeenCalledWith('audnexus')
	})
})
