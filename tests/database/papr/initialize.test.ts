import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { Document } from 'mongodb'

import { type Context, createDefaultContext } from '#config/context'
import { DATABASE_INDEXES } from '#config/databaseIndexes'
import { initialize } from '#config/papr'

// Papr binds registered models to the first db it is initialized with, so one
// stub must serve every test; its state and call history reset per test.
function databaseStub() {
	const indexes = new Map<string, Document[]>()
	const collections = new Map<string, { collectionName: string }>()
	const hooks: { beforeCreate?: () => Promise<void> } = {}
	const db = {
		hooks,
		collection: mock((name: string) => ({
			collectionName: name,
			createIndex: mock(async (key: Document, options: Document) => {
				await hooks.beforeCreate?.()
				const list = indexes.get(name) ?? []
				const text = Object.values(key).includes('text')
				list.push({ ...options, key: text ? { _fts: 'text', _ftsx: 1 } : key, ...(text ? { weights: { name: 1 } } : {}) })
				indexes.set(name, list)
				return options.name
			})
		})),
		collections: mock(async () => [...collections.values()]),
		createCollection: mock(async (name: string) => { collections.set(name, { collectionName: name }) }),
		command: mock(async () => ({})),
		listCollections: mock(() => ({ toArray: async () => [] })),
		runCursorCommand: mock((cmd: Document) => ({ toArray: async () => indexes.get(cmd.listIndexes) ?? [] })),
		reset() {
			indexes.clear()
			collections.clear()
			hooks.beforeCreate = undefined
			db.collection.mockClear()
			db.collections.mockClear()
			db.createCollection.mockClear()
			db.command.mockClear()
			db.listCollections.mockClear()
			db.runCursorCommand.mockClear()
			db.collections.mockImplementation(async () => [...collections.values()])
		}
	}
	return db
}
const db = databaseStub()
let ctx: Context
beforeEach(() => {
	db.reset()
	ctx = { client: { db: mock(() => db) } } as never
})

describe('shared initialization', () => {
	test('does not resolve readiness until awaited index creation completes', async () => {
		const gate = Promise.withResolvers<void>()
		const entered = Promise.withResolvers<void>()
		db.hooks.beforeCreate = async () => { entered.resolve(); await gate.promise }
		let ready = false
		const starting = initialize(ctx).then(() => { ready = true })
		await entered.promise
		expect(ready).toBe(false)
		gate.resolve()
		await starting
		expect(ready).toBe(true)
	})
	test('registers validated namespaces before building all twelve indexes and repeats without duplication', async () => {
		await initialize(ctx)
		expect(ctx.client.db).toHaveBeenCalledWith('audnexus')
		expect(db.createCollection.mock.calls.length).toBeGreaterThanOrEqual(8)
		expect(db.runCursorCommand).toHaveBeenCalled()
		await initialize(ctx)
		for (const collection of new Set(DATABASE_INDEXES.map((index) => index.collection))) {
			const docs = await db.runCursorCommand({ listIndexes: collection }).toArray()
			expect(docs).toHaveLength(DATABASE_INDEXES.filter((index) => index.collection === collection).length)
		}
	})
	test('uses the explicit database with a normal context client', async () => {
		const real = createDefaultContext('mongodb://localhost:27017')
		real.client.db = mock(() => db) as never
		await initialize(real)
		expect(real.client.db).toHaveBeenCalledWith('audnexus')
		await real.client.close()
	})
	test('retries only NamespaceExists and completes validator preparation', async () => {
		db.createCollection.mockImplementationOnce(async (name: string) => {
			const raced = { collectionName: name }
			db.collections.mockResolvedValue([raced])
			throw Object.assign(new Error('namespace exists'), { code: 48 })
		})
		await initialize(ctx)
		expect(db.command.mock.calls.some(([cmd]) => 'collMod' in cmd)).toBe(true)
	})
	test('propagates schema authorization failures without building indexes', async () => {
		const error = Object.assign(new Error('unauthorized'), { code: 13 })
		db.createCollection.mockRejectedValueOnce(error)
		await expect(initialize(ctx)).rejects.toBe(error)
		expect(db.runCursorCommand).not.toHaveBeenCalled()
	})
})
