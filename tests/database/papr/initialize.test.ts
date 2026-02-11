jest.mock('mongodb')
import { Db } from 'mongodb'

import { Context, createDefaultContext } from '#config/context'
import { initialize } from '#config/papr'
import { createMockContext, MockContext } from '#config/test-context'

let mockCtx: MockContext
let ctx: Context

// Create context
beforeEach(() => {
	mockCtx = createMockContext()
	ctx = mockCtx as unknown as Context
	const mockDbInstance = {
		collection: jest.fn()
	} as unknown as Db
	jest.spyOn(ctx.client, 'db').mockReturnValue(mockDbInstance)
	jest.spyOn(ctx.client, 'connect').mockResolvedValue(ctx.client)
})

describe('Papr should', () => {
	test('initialize with mock', async () => {
		await expect(initialize(ctx)).resolves.toBeUndefined()
		expect(ctx.client.db).toHaveBeenCalledWith('audnexus')
	})
	test('initialize with real', async () => {
		ctx = createDefaultContext('mongodb://localhost:27017')
		await expect(initialize(ctx)).resolves.toBeUndefined()
		expect(ctx.client.db).toHaveBeenCalledWith('audnexus')
	})
})
