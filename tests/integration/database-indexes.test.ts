import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { type Db, MongoClient } from 'mongodb'
import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

import { prepare } from '../../src/history'
import { runIndexCommand } from '../../src/indexes'

import { type HistoryMongo, resolveHistoryMongo } from './env'
import { CONTAINER_PREFIX, startReplicaSet, stopReplicaSet } from './mongo-rs'

import { DATABASE_INDEXES } from '#config/databaseIndexes'
import { initialize } from '#config/papr'
import { inspectIndexes, reconcileIndexes } from '#helpers/database/indexes'

const container = `audnexus-indexes-${randomUUID()}`
let client: MongoClient
let db: Db
let owned = false
beforeAll(async () => {
	const { uri } = await startReplicaSet({ container, enableTestCommands: true })
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

	test('text index pins simple collation on collections with a non-simple default', async () => {
		// MongoDB refuses to create a text index on a collection whose
		// default collation is not simple unless the index specifies a
		// simple collation explicitly (the collection collation is
		// inherited into the spec, which is rejected). A dedicated
		// collection keeps this independent of earlier catalog tests.
		const collection = 'collated_authors'
		const definition = { ...DATABASE_INDEXES.find((index) => index.id === 'authors.search')!, collection }
		await db.createCollection(collection, { collation: { locale: 'en' } })
		await expect(
			db.collection(collection).createIndex({ name: 'text' }, { name: 'naive_text' })
		).rejects.toThrow()
		await reconcileIndexes(db, { selection: [definition] })
		// Mongo omits the collation field from text indexes that use the
		// simple collation, so readiness (no diff against the definition) is
		// the observable pin.
		expect((await inspectIndexes(db, [definition])).outcomes[0].status).toBe('present')
		// Adoption: an existing simple-collation text index under any name is
		// adopted, not re-created, and the collection's own default
		// collation is left untouched. MongoDB allows one text index per
		// collection, so the replacement is dropped first, never built
		// beside it.
		const collectionBefore = (await db.listCollections({ name: collection }).toArray())[0]
		await db.collection(collection).dropIndex('name_text')
		await db.collection(collection).createIndex({ name: 'text' }, { name: 'legacy_author_search', collation: { locale: 'simple' } })
		const report = await reconcileIndexes(db, { selection: [definition] })
		expect(report.outcomes[0]).toMatchObject({ status: 'adopted', actualName: 'legacy_author_search' })
		expect((await db.listCollections({ name: collection }).toArray())[0]).toEqual(collectionBefore)
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

	test('an interrupted run can never block the next replica set resolution', async () => {
		// Reproduce the interrupted-run consumer failure with the exact
		// fixture an interrupted old-harness run left behind: a leftover
		// container under the old fixed name `audnexus-history-rs-<suite>`
		// (name collision) plus a bound host port. With a fixed name the
		// next `docker run` rejects the name before the harness owns it, so
		// the consumer skipped a whole suite even with a healthy Docker
		// daemon.
		const docker = (args: string[]) => execFileSync('docker', args, { encoding: 'utf8' })
		// Force the Docker path: an exported HISTORY_TEST_MONGODB_URI would
		// make the consumer return the explicit URI and skip the harness
		// this test exercises.
		const explicitUri = process.env.HISTORY_TEST_MONGODB_URI
		try {
			delete process.env.HISTORY_TEST_MONGODB_URI
			// Unique per invocation: the legacy fixed name for this suite is
			// the exact old-harness collision, but a constant name would
			// itself collide across simultaneous invocations or a prior
			// interrupted test, defeating full-suite isolation.
			const suite = `interrupted-run-${randomUUID()}`
			const leftover = `${CONTAINER_PREFIX}-${suite}`
			const image = 'mongo:7.0.45'
			const started = spawnSync('docker', [
				'run', '-d', '--name', leftover, '-p', '127.0.0.1::27017', image, '--replSet', 'rs0'
			])
			expect(started.status).toBe(0)
			const first = String(started.stdout).trim()
			let resolution: HistoryMongo | null
			try {
				// `docker port` renders `27017/tcp -> 127.0.0.1:42945`; normalize
				// each mapping to the bare host port so the non-reuse check
				// compares comparable values.
				const firstPorts = new Set(
					docker(['port', first]).trim().split('\n')
						.map((line) => line.trim().match(/:(\d+)$/)?.[1])
						.filter((port): port is string => Boolean(port))
				)
				expect(firstPorts.size).toBeGreaterThan(0)
				expect([...firstPorts].every((port) => /^\d+$/.test(port)), 'normalized docker port output must be bare host ports').toBe(true)
				resolution = await resolveHistoryMongo(suite)
				expect(resolution, 'consumer must resolve a replica set despite the leftover container').not.toBeNull()
				const newPort = resolution!.uri.match(/^mongodb:\/\/127\.0\.0\.1:(\d+)/)![1]
				expect(firstPorts.has(newPort), 'consumer must not reuse a port owned by the leftover container').toBe(false)
				expect(docker(['inspect', first, '--format', '{{.State.Running}}']).trim()).toBe('true')
			} finally {
				await resolution?.stop()
				docker(['rm', '-f', first])
			}
		} finally {
			if (explicitUri === undefined) delete process.env.HISTORY_TEST_MONGODB_URI
			else process.env.HISTORY_TEST_MONGODB_URI = explicitUri
		}
	}, 300000)
})
