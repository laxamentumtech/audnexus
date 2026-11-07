// The mongodb driver is mocked so `initialize()` never connects. `initialize`
// registers the book-history models, so papr's `updateSchemas()` runs its real
// per-model collection check: `db.collections()`, then `db.createCollection()`
// (collection absent) or `db.command({ collMod })` (collection present). The
// stub db must expose that surface; it reports no existing collections, so the
// create path is taken. `collection` returns one shared instance: papr builds
// each model collection through it during `initialize(db)`, so a fresh stub per
// call would leave the model's collection uninitialized.
mock.module('mongodb', () => ({
	MongoClient: mock().mockImplementation(() => ({
		connect: mock().mockResolvedValue(undefined),
		db: mock().mockReturnValue({
			collection: mock().mockReturnValue({}),
			collections: mock().mockResolvedValue([]),
			createCollection: mock().mockResolvedValue(undefined),
			command: mock().mockResolvedValue({})
		}),
		close: mock().mockResolvedValue(undefined)
	}))
}))
import { beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'

import { Context, createDefaultContext } from '#config/context'
import { initialize } from '#config/papr'
import { createMockContext, MockContext } from '#config/test-context'

let mockCtx: MockContext
let ctx: Context

beforeEach(() => {
	mockCtx = createMockContext()
	ctx = mockCtx as unknown as Context
	const stub = {
		collection: mock().mockReturnValue({}),
		collections: mock().mockResolvedValue([]),
		createCollection: mock().mockResolvedValue(undefined),
		command: mock().mockResolvedValue({})
	}
	spyOn(ctx.client, 'db').mockReturnValue(stub as never)
	spyOn(ctx.client, 'connect').mockResolvedValue(ctx.client)
})

describe('Papr should', () => {
	test('initialize with mock', async () => {
		await expect(initialize(ctx)).resolves.toBeUndefined()
		expect(ctx.client.db).toHaveBeenCalledWith('audnexus')
	})
	test('initialize with mock client via createDefaultContext', async () => {
		ctx = createDefaultContext('mongodb://localhost:27017')
		// Verify initialize works when called via createDefaultContext (mongodb module is mocked)
		await expect(initialize(ctx)).resolves.toBeUndefined()
		expect(ctx.client.db).toHaveBeenCalledWith('audnexus')
	})
})
