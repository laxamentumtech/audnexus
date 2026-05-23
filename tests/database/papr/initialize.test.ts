import { beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { Db } from 'mongodb'

import { Context, createDefaultContext } from '#config/context'
import { initialize } from '#config/papr'
import { createMockContext, MockContext } from '#config/test-context'

let mockCtx: MockContext
let ctx: Context

beforeEach(() => {
	mockCtx = createMockContext()
	ctx = mockCtx as unknown as Context
	const mockDbInstance = {
		collection: mock()
	} as unknown as Db
	spyOn(ctx.client, 'db').mockReturnValue(mockDbInstance)
	spyOn(ctx.client, 'connect').mockResolvedValue(ctx.client)
})

describe('Papr should', () => {
	test('initialize with mock', async () => {
		await expect(initialize(ctx)).resolves.toBeUndefined()
		expect(ctx.client.db).toHaveBeenCalledWith('audnexus')
	})
	test('initialize with real', async () => {
		ctx = createDefaultContext('mongodb://localhost:27017')
		// Just verify initialize doesn't throw with a real client
		await expect(initialize(ctx)).resolves.toBeUndefined()
	})
})
