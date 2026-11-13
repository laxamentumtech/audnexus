import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { type Db, MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'

import { prepare } from '../../src/history'
import { runIndexCommand } from '../../src/indexes'

import { startReplicaSet, stopReplicaSet } from './mongo-rs'

import { DATABASE_INDEXES } from '#config/databaseIndexes'
import { initialize } from '#config/papr'
import { inspectIndexes, reconcileIndexes } from '#helpers/database/indexes'

const container = `audnexus-indexes-${randomUUID()}`
let client: MongoClient
let db: Db
let owned = false
beforeAll(async () => {
	const uri = await startReplicaSet({ container, enableTestCommands: true })
	owned = true
	client = await MongoClient.connect(uri)
	db = client.db('audnexus')
}, 90000)
afterAll(async () => {
	await client?.close()
	if (owned) await stopReplicaSet(container)
})
beforeEach(async () => { await db.dropDatabase() })

async function metadata() {
	const collections = await db.listCollections({}, { nameOnly: false }).toArray()
	return Promise.all(collections.sort((a, b) => a.name.localeCompare(b.name)).map(async (collection) => ({
		name: collection.name,
		options: collection.options,
		indexes: await db.collection(collection.name).listIndexes().toArray()
	})))
}

describe('actual MongoDB application index lifecycle', () => {
	test('a real paused build is not ready until Mongo commits it', async () => {
		// Verified in mongo r7.0.45 src/mongo/db/index_builds_coordinator.cpp:
		// hangAfterInitializingIndexBuild pauses before the collection scan.
		await db.collection('books').insertOne({ asin: 'B000000001', region: 'us' })
		const definition = DATABASE_INDEXES[0]
		const admin = client.db('admin')
		const point = await admin.command({ configureFailPoint: 'hangAfterInitializingIndexBuild', mode: 'alwaysOn' })
		const build = db.collection('books').createIndex(definition.keys, { name: definition.name })
		// Attach a rejection handler immediately; finally awaits the original.
		void build.catch(() => {})
		let waiting: Promise<unknown> | undefined
		try {
			await admin.command({ waitForFailPoint: 'hangAfterInitializingIndexBuild', timesEntered: Number(point.count) + 1, maxTimeMS: 10000 })
			expect((await inspectIndexes(db, [definition])).outcomes[0].status).toBe('building')
			await expect(reconcileIndexes(db, { selection: [definition], mode: 'verify' })).rejects.toThrow('building')
			const observed = Promise.withResolvers<void>()
			let ready = false
			waiting = reconcileIndexes(db, { selection: [definition], buildWaitMs: 20000, emit: (outcome) => { if (outcome.status === 'building') observed.resolve() } }).then(() => { ready = true })
			await observed.promise
			expect(ready).toBe(false)
			await admin.command({ configureFailPoint: 'hangAfterInitializingIndexBuild', mode: 'off' })
			await build
			await waiting
			expect(ready).toBe(true)
			expect((await inspectIndexes(db, [definition])).outcomes[0].status).toBe('present')
		} finally {
			await admin.command({ configureFailPoint: 'hangAfterInitializingIndexBuild', mode: 'off' })
			await build
			await waiting
		}
	}, 60000)
	test('concurrent fresh initialization installs validators and all twelve committed indexes; repeats are idempotent', async () => {
		await Promise.all([initialize({ client }), initialize({ client })])
		const report = await inspectIndexes(db)
		expect(report.outcomes).toHaveLength(12)
		expect(report.outcomes.every((outcome) => outcome.status === 'present')).toBe(true)
		const before = await metadata()
		for (const collection of before) expect(collection.options?.validator).toBeDefined()
		await initialize({ client })
		expect(await metadata()).toEqual(before)
		await expect(db.collection('book_history_states').insertOne({ invalid: true })).rejects.toThrow()
	}, 90000)

	test('adopts production and lab names and preserves duplicate/regionless book identity semantics', async () => {
		await db.collection('books').insertMany([{ asin: 'B000000001', region: 'us' }, { asin: 'B000000001', region: 'us' }, { asin: 'B000000001' }])
		await db.collection('books').createIndex({ asin: 1, region: 1 })
		await db.collection('authors').createIndex({ name: 'text' }, { name: 'production_author_search' })
		await initialize({ client })
		const report = await inspectIndexes(db)
		expect(report.outcomes.find((outcome) => outcome.id === 'books.lookup')).toMatchObject({ status: 'adopted', actualName: 'asin_1_region_1' })
		expect(report.outcomes.find((outcome) => outcome.id === 'authors.search')).toMatchObject({ status: 'adopted', actualName: 'production_author_search' })
		const books = await db.collection('books').listIndexes().toArray()
		expect(books.filter((index) => Object.keys(index.key).join(',') === 'asin,region')).toHaveLength(1)
		expect(await db.collection('books').countDocuments({ asin: 'B000000001' })).toBe(3)
	}, 90000)

	test('normalizes actual Mongo text metadata and default language/weights; changed text requires a migration', async () => {
		await initialize({ client })
		const text = (await db.collection('authors').listIndexes().toArray()).find((index) => index.name === 'name_text')!
		expect(text).toMatchObject({ key: { _fts: 'text', _ftsx: 1 }, weights: { name: 1 }, default_language: 'english', language_override: 'language', textIndexVersion: 3 })
		const definition = DATABASE_INDEXES.find((index) => index.id === 'authors.search')!
		await expect(reconcileIndexes(db, { selection: [{ ...definition, name: 'author_search_v2', options: { weights: { name: 2 } } }] })).rejects.toThrow('migration required')
		expect((await db.collection('authors').listIndexes().toArray()).find((index) => index.name === 'name_text')).toEqual(text)
	}, 90000)

	test('check never creates namespaces or modifies validators/indexes, including failure', async () => {
		await expect(runIndexCommand(client, 'check')).rejects.toThrow('missing')
		expect(await db.listCollections().toArray()).toEqual([])
		const startupMode = process.env.DB_INDEX_MODE
		try {
			process.env.DB_INDEX_MODE = 'verify'
			await runIndexCommand(client, 'apply')
		} finally {
			if (startupMode === undefined) delete process.env.DB_INDEX_MODE
			else process.env.DB_INDEX_MODE = startupMode
		}
		const before = await metadata()
		await runIndexCommand(client, 'check')
		expect(await metadata()).toEqual(before)
	}, 90000)

	test('prepare applies the catalog under DB_INDEX_MODE=verify, same as indexes apply', async () => {
		const startupMode = process.env.DB_INDEX_MODE
		try {
			process.env.DB_INDEX_MODE = 'verify'
			await prepare(client)
			const report = await inspectIndexes(db)
			expect(report.outcomes).toHaveLength(12)
			expect(report.outcomes.every((outcome) => outcome.status === 'present')).toBe(true)
		} finally {
			if (startupMode === undefined) delete process.env.DB_INDEX_MODE
			else process.env.DB_INDEX_MODE = startupMode
		}
	}, 90000)

	test('ordered compound and unique conflicts fail without destructive DDL', async () => {
		const definition = DATABASE_INDEXES[0]
		await db.collection('books').createIndex({ region: 1, asin: 1 }, { name: definition.name })
		const before = await db.collection('books').listIndexes().toArray()
		await expect(reconcileIndexes(db, { selection: [definition] })).rejects.toThrow('ordered keys')
		expect(await db.collection('books').listIndexes().toArray()).toEqual(before)
		await db.dropDatabase()
		await db.collection('books').createIndex(definition.keys, { name: definition.name, unique: true })
		await expect(reconcileIndexes(db, { selection: [definition] })).rejects.toThrow('unique')
		expect((await db.collection('books').listIndexes().toArray()).find((index) => index.name === definition.name)?.unique).toBe(true)
	})

	test('effective collection collation, sparse, hidden and TTL compare against real metadata', async () => {
		await db.createCollection('collated', { collation: { locale: 'en', strength: 2 } })
		const definition = { ...DATABASE_INDEXES[0], id: 'collated.lookup', collection: 'collated', name: 'collated_lookup' }
		await reconcileIndexes(db, { selection: [definition] })
		expect((await inspectIndexes(db, [definition])).outcomes[0].status).toBe('present')
		for (const options of [{ sparse: true }, { hidden: true }, { expireAfterSeconds: 10 }]) {
			const custom = { ...definition, collection: `options_${Object.keys(options)[0]}`, name: 'option_index', keys: { timestamp: 1 as const }, options }
			await reconcileIndexes(db, { selection: [custom] })
			expect((await inspectIndexes(db, [custom])).outcomes[0].status).toBe('present')
			await expect(reconcileIndexes(db, { selection: [{ ...custom, options: {} }] })).rejects.toThrow('conflict')
		}
	})

	test('versioned access-path addition preserves every exact legacy history index and unknown index', async () => {
		await initialize({ client })
		await db.collection('books').createIndex({ oldField: 1 }, { name: 'legacy_extra' })
		const before = await metadata()
		const addition = { ...DATABASE_INDEXES[0], id: 'books.lookup.v2', name: 'book_lookup_v2', keys: { asin: 1 as const, region: 1 as const, updatedAt: 1 as const } }
		await reconcileIndexes(db, { selection: [...DATABASE_INDEXES, addition] })
		for (const old of before) {
			const current = await db.collection(old.name).listIndexes().toArray()
			for (const index of old.indexes) expect(current).toContainEqual(index)
		}
		for (const definition of DATABASE_INDEXES.filter((index) => index.requiredBy.includes('history'))) expect((await db.collection(definition.collection).listIndexes().toArray()).some((index) => index.name === definition.name)).toBe(true)
	}, 90000)

	test('concurrent DB-only apply completes before reporting readiness', async () => {
		await Promise.all([runIndexCommand(client, 'apply'), runIndexCommand(client, 'apply')])
		await expect(reconcileIndexes(db, { mode: 'verify' })).resolves.toMatchObject({ outcomes: expect.arrayContaining([expect.objectContaining({ id: 'books.lookup', status: 'present' })]) })
	}, 90000)
})
