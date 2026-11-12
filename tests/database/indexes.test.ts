import { describe, expect, mock, test } from 'bun:test'
import { type Document,Double, Int32, Long } from 'mongodb'

import { DATABASE_INDEXES, type ManagedIndex } from '#config/databaseIndexes'
import { indexDifferences, indexSettings, inspectIndexes, reconcileIndexes } from '#helpers/database/indexes'

const lookup = DATABASE_INDEXES[0]
function fixture(initial: Document[] = []) {
	const indexes = [...initial]
	const createIndex = mock(async (key: Document, options: Document) => {
		indexes.push({ key, ...options })
		return options.name
	})
	const db = {
		listCollections: mock(() => ({ toArray: async () => [] })),
		runCursorCommand: mock(() => ({ toArray: async () => indexes })),
		collection: mock(() => ({ createIndex }))
	}
	return { db, indexes, createIndex }
}

describe('index semantics', () => {
	test('has twelve distinct requirements and one shared nonunique book identity lookup', () => {
		expect(DATABASE_INDEXES).toHaveLength(12)
		expect(new Set(DATABASE_INDEXES.map((index) => index.id)).size).toBe(12)
		expect(DATABASE_INDEXES.filter((index) => index.collection === 'books' && 'asin' in index.keys)).toEqual([lookup])
		expect(lookup.options.unique).toBeUndefined()
	})
	test('compound keys are ordered and uniqueness is checked in both directions', () => {
		expect(indexDifferences(lookup, { key: { region: 1, asin: 1 } })).toContain('ordered keys')
		expect(indexDifferences(lookup, { key: lookup.keys, unique: true })).toContain('unique')
		expect(indexDifferences({ ...lookup, options: { unique: true } }, { key: lookup.keys })).toContain('unique')
	})
	test('normalizes harmless expression order but preserves embedded equality, array order, and BSON types', () => {
		const definition: ManagedIndex = { ...lookup, options: { partialFilterExpression: { x: { $gt: 1, $lt: 5 }, y: { $exists: true } } } }
		expect(indexDifferences(definition, { key: lookup.keys, partialFilterExpression: { y: { $exists: true }, x: { $lt: new Int32(5), $gt: new Int32(1) } } })).toEqual([])
		const expected = { ...lookup, options: { partialFilterExpression: { meta: { a: 1, b: 2 } } } }
		expect(indexDifferences(expected, { key: lookup.keys, partialFilterExpression: { meta: { b: 2, a: 1 } } })).toContain('partialFilterExpression')
		for (const value of [[2, 1], new Double(1), Long.fromNumber(1)]) {
			const desired = Array.isArray(value) ? [1, 2] : new Int32(1)
			expect(indexDifferences({ ...lookup, options: { partialFilterExpression: { x: { $eq: desired } } } }, { key: lookup.keys, partialFilterExpression: { x: { $eq: value } } })).toContain('partialFilterExpression')
		}
	})
	test('compares effective collation, hidden, sparse, and TTL defaults and drift', () => {
		const def = { ...lookup, options: { collation: { locale: 'en' } } }
		const actual = { key: lookup.keys, collation: { locale: 'en', caseLevel: false, caseFirst: 'off', strength: new Int32(3), numericOrdering: false, alternate: 'non-ignorable', maxVariable: 'punct', normalization: false, backwards: false, version: '57.1' } }
		expect(indexDifferences(def, actual)).toEqual([])
		expect(indexDifferences({ ...lookup, options: {} }, actual, { locale: 'en' })).toEqual([])
		for (const [key, value] of Object.entries({ hidden: true, sparse: true, expireAfterSeconds: 100 })) expect(indexDifferences(lookup, { key: lookup.keys, [key]: value })).toContain(key)
		expect(indexDifferences(lookup, { key: lookup.keys, collation: { locale: 'simple' } })).toEqual([])
	})
	test('normalizes Mongo internal text metadata and rejects changed weights/language/version', () => {
		const def = DATABASE_INDEXES.find((index) => index.id === 'authors.search')!
		const actual = { key: { _fts: 'text', _ftsx: new Int32(1) }, weights: { name: new Int32(1) }, default_language: 'english', language_override: 'language', textIndexVersion: new Int32(3) }
		expect(indexDifferences(def, actual)).toEqual([])
		for (const [key, value] of Object.entries({ weights: { name: 2 }, default_language: 'none', language_override: 'lang', textIndexVersion: 2 })) expect(indexDifferences(def, { ...actual, [key]: value })).toContain(key)
	})
	test('validates startup policy', () => {
		expect(indexSettings({})).toEqual({ mode: 'auto', buildWaitMs: 1800000 })
		for (const env of [{ DB_INDEX_MODE: 'off' }, { DB_INDEX_BUILD_WAIT_MS: '0' }, { DB_INDEX_BUILD_WAIT_MS: '1.5' }]) expect(() => indexSettings(env)).toThrow()
	})
})

describe('consumer-visible reconciliation', () => {
	test('awaits each build before issuing the next catalog build', async () => {
		const f = fixture()
		const entered = Promise.withResolvers<void>()
		const release = Promise.withResolvers<void>()
		f.createIndex.mockImplementationOnce(async (key, options) => {
			entered.resolve()
			await release.promise
			f.indexes.push({ key, ...options })
			return options.name
		})
		const addition: ManagedIndex = { ...lookup, id: 'books.walk.v2', name: 'book_walk_v2', keys: { updatedAt: 1 } }
		const starting = reconcileIndexes(f.db as never, { selection: [lookup, addition] })
		await entered.promise
		expect(f.createIndex).toHaveBeenCalledTimes(1)
		release.resolve()
		await starting
		expect(f.createIndex).toHaveBeenCalledTimes(2)
	})
	test('never accepts an incompatible concurrent create conflict', async () => {
		const f = fixture()
		f.createIndex.mockImplementationOnce(async () => {
			f.indexes.push({ name: lookup.name, key: { asin: -1, region: 1 } })
			throw Object.assign(new Error('different index specification'), { code: 85 })
		})
		await expect(reconcileIndexes(f.db as never, { selection: [lookup] })).rejects.toThrow('conflict')
		expect(f.indexes[0].key).toEqual({ asin: -1, region: 1 })
	})
	test('adopts physical legacy names without duplicate creation and reports extras', async () => {
		const f = fixture([{ name: 'asin_1_region_1', key: lookup.keys }, { name: 'extra', key: { legacy: 1 } }])
		const report = await reconcileIndexes(f.db as never, { selection: [lookup] })
		expect(report.outcomes[0].status).toBe('adopted')
		expect(f.createIndex).not.toHaveBeenCalled()
		expect(report.extras).toContainEqual({ collection: 'books', name: 'extra' })
	})
	test('verify and inspection are read-only and a missing requirement fails', async () => {
		const f = fixture()
		expect((await inspectIndexes(f.db as never, [lookup])).outcomes[0].status).toBe('missing')
		await expect(reconcileIndexes(f.db as never, { selection: [lookup], mode: 'verify' })).rejects.toThrow('missing')
		expect(f.createIndex).not.toHaveBeenCalled()
	})
	test('verify rejects a building index; auto waits until COMMITTED before resolving readiness', async () => {
		const pending: Document = { name: lookup.name, key: lookup.keys, buildUUID: 'pending' }
		const f = fixture([pending])
		await expect(reconcileIndexes(f.db as never, { selection: [lookup], mode: 'verify' })).rejects.toThrow('building')
		const observed = Promise.withResolvers<void>()
		let settled = false
		const starting = reconcileIndexes(f.db as never, { selection: [lookup], buildWaitMs: 2000, emit: (outcome) => { if (outcome.status === 'building') observed.resolve() } }).then((report) => { settled = true; return report })
		await observed.promise
		expect(settled).toBe(false)
		expect(f.createIndex).not.toHaveBeenCalled()
		delete pending.buildUUID
		expect((await starting).outcomes[0].status).toBe('present')
	})
	test('an uncommitted build times out instead of opening readiness', async () => {
		const f = fixture([{ name: lookup.name, key: lookup.keys, buildUUID: 'pending' }])
		await expect(reconcileIndexes(f.db as never, { selection: [lookup], buildWaitMs: 1 })).rejects.toThrow('building')
	})
	test('a compatible concurrent create race is re-inspected and awaited', async () => {
		const f = fixture()
		const observed = Promise.withResolvers<void>()
		const pending: Document = { name: 'asin_1_region_1', key: lookup.keys, buildUUID: 'pending' }
		f.createIndex.mockImplementationOnce(async () => { f.indexes.push(pending); throw Object.assign(new Error('concurrent build'), { code: 285 }) })
		const starting = reconcileIndexes(f.db as never, { selection: [lookup], buildWaitMs: 2000, emit: (outcome) => { if (outcome.status === 'building') observed.resolve() } })
		await observed.promise
		delete pending.buildUUID
		expect((await starting).outcomes[0].actualName).toBe('asin_1_region_1')
	})
	test('real conflicts and unrelated Mongo errors retain actionable diagnostics', async () => {
		const f = fixture([{ name: lookup.name, key: { region: 1, asin: 1 } }])
		await expect(reconcileIndexes(f.db as never, { selection: [lookup] })).rejects.toThrow('migration required')
		expect(f.createIndex).not.toHaveBeenCalled()
		const denied = fixture()
		const error = Object.assign(new Error('not authorized'), { code: 13 })
		denied.createIndex.mockRejectedValueOnce(error)
		try { await reconcileIndexes(denied.db as never, { selection: [lookup] }); throw new Error('unexpected success') } catch (failure) {
			expect(failure).toHaveProperty('cause', error)
			expect(failure).toHaveProperty('report.outcomes.0.mongoCode', 13)
		}
	})
	test('versioned normal additions preserve every exact legacy history index', async () => {
		const legacy = DATABASE_INDEXES.filter((index) => index.requiredBy.includes('history'))
		const initial = legacy.map((index) => ({ name: index.name, key: index.keys, ...index.options }))
		const f = fixture(initial)
		const before = structuredClone(f.indexes)
		await reconcileIndexes(f.db as never, { selection: [{ ...lookup, id: 'books.lookup.v2', name: 'books_lookup_v2', keys: { asin: 1, region: 1, updatedAt: 1 } }] })
		expect(f.indexes.slice(0, before.length)).toEqual(before)
		expect(f.indexes.at(-1)?.name).toBe('books_lookup_v2')
	})
})
