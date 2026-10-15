import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'

const authorsDb: { asin: string; name: string; aliases?: string[] }[] = [
	// Same person, three ASINs across regions — folds to one ambiguous key
	{ asin: 'B00000000A', name: 'George R. R. Martin' },
	{ asin: 'B00000000B', name: 'George R. R. Martin' },
	{ asin: 'B00000000C', name: 'George R. R. Martin' },
	// Case + whitespace variants of the same name — must fold onto one ASIN
	{ asin: 'B00000000D', name: 'jason  ANSPACH' },
	{ asin: 'B00000000D', name: '  Jason   Anspach ' },
	// Unique names
	{ asin: 'B00000000E', name: 'Nick Cole' },
	{ asin: 'B00000000F', name: 'Someone Else' },
	// Japanese-script name: distinct spellings (spacing) of one ASIN fold
	// together; a different spelling is a distinct key
	{ asin: 'B00000000G', name: '村上 春樹' },
	{ asin: 'B00000000G', name: '村上春樹' },
	{ asin: 'B00000000H', name: '井上 靖' },
	// Alias of a unique author — resolves to the canonical row's ASIN
	{ asin: 'B00000000I', name: 'Kazuo Ishiguro', aliases: ['K. Ishiguro'] },
	// Alias that collides with another row's name — makes that folded name
	// ambiguous, consistent with homonym handling
	{ asin: 'B00000000J', name: 'Nick Cole Jr.', aliases: ['nick cole'] }
]
const PROJECTION = { projection: { asin: 1, name: 1, aliases: 1 } }

// Handles both the full build (query {}) and the ASIN-scoped refresh
// (query { asin: { $in: [...] } }) by returning the matching rows.
const mockFind = mock((query: object, options: object) => {
	expect(options).toEqual(PROJECTION)
	if (Object.keys(query).length === 0) {
		return Promise.resolve([...authorsDb])
	}
	const inFilter = (query as { asin?: { $in?: string[] } }).asin?.$in
	expect(inFilter).toBeInstanceOf(Array)
	return Promise.resolve(authorsDb.filter((row) => inFilter?.includes(row.asin)))
})

mock.module('#config/models/Author', () => ({
	default: { find: mockFind }
}))

import AuthorModel from '#config/models/Author'
import { authorNameIndex } from '#helpers/authorNameIndex/AuthorNameIndex'

// Test-only accessor for the private folded-name index (a plain instance
// field hidden from the public type); used to assert publication state.
const liveIndex = (): Map<string, Set<string>> | undefined =>
	(authorNameIndex as unknown as { index?: Map<string, Set<string>> }).index

describe('AuthorNameIndex should', () => {
	beforeEach(async () => {
		// Reset the shared model mock so a persistent mockImplementation from
		// an earlier test cannot leak into this one's build
		mockFind.mockImplementation((query: object, options: object) => {
			expect(options).toEqual(PROJECTION)
			if (Object.keys(query).length === 0) {
				return Promise.resolve([...authorsDb])
			}
			const inFilter = (query as { asin?: { $in?: string[] } }).asin?.$in
			expect(inFilter).toBeInstanceOf(Array)
			return Promise.resolve(authorsDb.filter((row) => inFilter?.includes(row.asin)))
		})
		authorNameIndex.invalidate()
		await authorNameIndex.build()
	})

	test('resolve awaits an in-flight lazy build and resolves correctly', async () => {
		authorNameIndex.invalidate()
		expect(await authorNameIndex.resolve('Jason Anspach')).toEqual({ asin: 'B00000000D' })
	})

	test('concurrent resolves during a build all get the complete index', async () => {
		authorNameIndex.invalidate()
		const calls = mockFind.mock.calls.length
		const deferred = Promise.withResolvers<typeof authorsDb>()
		mockFind.mockImplementationOnce(() => deferred.promise)
		// startBuild synchronously reaches the in-flight find, so the release
		// can happen immediately without racing build startup
		const pending = ['Jason Anspach', 'George R. R. Martin', 'Nobody By That Name'].map((name) =>
			authorNameIndex.resolve(name)
		)
		expect(mockFind.mock.calls.length).toBe(calls + 1)
		deferred.resolve([...authorsDb])
		// Every caller saw the fully built index, not a built-but-empty one
		const results = await Promise.all(pending)
		expect(results).toEqual([
			{ asin: 'B00000000D' },
			{ candidates: ['B00000000A', 'B00000000B', 'B00000000C'] },
			{}
		])
	})

	test('folds case and whitespace variants onto a single ASIN', async () => {
		expect(await authorNameIndex.resolve('jason  ANSPACH')).toEqual({ asin: 'B00000000D' })
		expect(await authorNameIndex.resolve('  Jason   Anspach ')).toEqual({ asin: 'B00000000D' })
	})

	test('returns candidates sorted for ambiguous names', async () => {
		expect(await authorNameIndex.resolve('George R. R. Martin')).toEqual({
			candidates: ['B00000000A', 'B00000000B', 'B00000000C']
		})
	})

	test('folds Japanese-script name spacing onto one ASIN', async () => {
		expect(await authorNameIndex.resolve('村上春樹')).toEqual({ asin: 'B00000000G' })
		expect(await authorNameIndex.resolve('村上 春樹')).toEqual({ asin: 'B00000000G' })
		// Distinct spelling resolves to its own ASIN, not merged
		expect(await authorNameIndex.resolve('井上 靖')).toEqual({ asin: 'B00000000H' })
	})

	test('returns empty result for unknown names', async () => {
		expect(await authorNameIndex.resolve('Nobody By That Name')).toEqual({})
	})

	test('resolves an alias to the canonical author ASIN', async () => {
		expect(await authorNameIndex.resolve('K. Ishiguro')).toEqual({ asin: 'B00000000I' })
		// Canonical name still resolves
		expect(await authorNameIndex.resolve('Kazuo Ishiguro')).toEqual({ asin: 'B00000000I' })
	})

	test('an alias colliding with another row makes that name ambiguous', async () => {
		expect(await authorNameIndex.resolve('Nick Cole')).toEqual({
			candidates: ['B00000000E', 'B00000000J']
		})
		// The colliding row's own name is unaffected
		expect(await authorNameIndex.resolve('Nick Cole Jr.')).toEqual({ asin: 'B00000000J' })
	})

	test('build is single-flight under concurrent calls', async () => {
		const calls = mockFind.mock.calls.length
		authorNameIndex.invalidate()
		await Promise.all([authorNameIndex.build(), authorNameIndex.build(), authorNameIndex.build()])
		// Three concurrent builds share one in-flight find
		expect(mockFind.mock.calls.length).toBe(calls + 1)
	})

	test('invalidate forces a rebuild on the next resolve', async () => {
		const calls = mockFind.mock.calls.length
		authorNameIndex.invalidate()
		await authorNameIndex.build()
		expect(mockFind.mock.calls.length).toBe(calls + 1)
	})

	test('a build started before invalidate() cannot republish stale data', async () => {
		const calls = mockFind.mock.calls.length
		authorNameIndex.invalidate()
		const deferred = Promise.withResolvers<typeof authorsDb>()
		mockFind.mockImplementationOnce(() => deferred.promise)
		const build = authorNameIndex.build()
		expect(mockFind.mock.calls.length).toBe(calls + 1)
		// Invalidate while the build is in flight; its read data is stale
		authorNameIndex.invalidate()
		deferred.resolve([...authorsDb])
		await build
		// The stale build must not have published: resolving triggers a fresh build
		const callsAfterInvalidate = mockFind.mock.calls.length
		expect(await authorNameIndex.resolve('Jason Anspach')).toEqual({ asin: 'B00000000D' })
		expect(mockFind.mock.calls.length).toBe(callsAfterInvalidate + 1)
	})

	test('a build failure degrades to not-found and the next resolve retries', async () => {
		const spy = spyOn(authorNameIndex.logger, 'error').mockImplementation(() => undefined)
		const calls = mockFind.mock.calls.length
		authorNameIndex.invalidate()
		mockFind.mockImplementationOnce(() => Promise.reject(new Error('db down')))
		// The first build fails; resolve retries once within the same call
		expect(await authorNameIndex.resolve('Jason Anspach')).toEqual({ asin: 'B00000000D' })
		expect(mockFind.mock.calls.length).toBe(calls + 2)
		expect(spy).toHaveBeenCalled()
	})

	test('persistent build failure degrades to not-found without looping', async () => {
		const spy = spyOn(authorNameIndex.logger, 'error').mockImplementation(() => undefined)
		const calls = mockFind.mock.calls.length
		authorNameIndex.invalidate()
		mockFind.mockImplementation(() => Promise.reject(new Error('db down')))
		expect(await authorNameIndex.resolve('Jason Anspach')).toEqual({})
		// Exactly the initial attempt plus the single bounded retry
		expect(mockFind.mock.calls.length).toBe(calls + 2)
		expect(spy).toHaveBeenCalledTimes(2)
	})

	test('a resolve that joined an invalidated build retries with a fresh build', async () => {
		const calls = mockFind.mock.calls.length
		authorNameIndex.invalidate()
		const deferred = Promise.withResolvers<typeof authorsDb>()
		mockFind.mockImplementationOnce(() => deferred.promise)
		// Starts build 1 and joins it, before the invalidation
		const resolution = authorNameIndex.resolve('Jason Anspach')
		authorNameIndex.invalidate()
		// Build 1 completes but must not publish its stale read
		deferred.resolve([...authorsDb])
		// The resolver sees no published index and self-primes a fresh build
		expect(await resolution).toEqual({ asin: 'B00000000D' })
		expect(mockFind.mock.calls.length).toBe(calls + 2)
	})

	test('markDirty refreshes only the affected ASIN (ASIN-scoped query, no full reload)', async () => {
		const calls = mockFind.mock.calls.length
		authorNameIndex.markDirty('B00000000D')
		expect(await authorNameIndex.resolve('Jason Anspach')).toEqual({ asin: 'B00000000D' })
		// Exactly one ASIN-scoped refresh query, not a {} full reload
		expect(mockFind.mock.calls.length).toBe(calls + 1)
		expect(mockFind.mock.calls.at(-1)?.[0]).toEqual({ asin: { $in: ['B00000000D'] } })
	})

	test('multi-region deletion of an ASIN removes all its contributions', async () => {
		// Simulate deleting every row for B00000000E (unique 'Nick Cole')
		const saved = authorsDb.filter((row) => row.asin !== 'B00000000E')
		mockFind.mockImplementation((query: object) => {
			if (Object.keys(query).length === 0) return Promise.resolve([...saved])
			const inFilter = (query as { asin?: { $in?: string[] } }).asin?.$in
			return Promise.resolve(saved.filter((row) => inFilter?.includes(row.asin)))
		})
		authorNameIndex.markDirty('B00000000E')
		// The deleted name no longer resolves
		expect(await authorNameIndex.resolve('Nick Cole')).toEqual({ asin: 'B00000000J' })
		// Its alias collision is gone too: only the Jr. row's own name remains
		expect(await authorNameIndex.resolve('Nick Cole Jr.')).toEqual({ asin: 'B00000000J' })
	})

	test('refresh removes a renamed name and adds the new one', async () => {
		// B00000000F 'Someone Else' is renamed to 'Fresh Name'
		mockFind.mockImplementation((query: object) => {
			if (Object.keys(query).length === 0) return Promise.resolve([...authorsDb])
			const inFilter = (query as { asin?: { $in?: string[] } }).asin?.$in
			return Promise.resolve(
				authorsDb
					.filter((row) => inFilter?.includes(row.asin))
					.map((row) => (row.asin === 'B00000000F' ? { ...row, name: 'Fresh Name' } : row))
			)
		})
		authorNameIndex.markDirty('B00000000F')
		expect(await authorNameIndex.resolve('Fresh Name')).toEqual({ asin: 'B00000000F' })
		expect(await authorNameIndex.resolve('Someone Else')).toEqual({})
	})

	test('refresh transitions a name from unique to ambiguous and back', async () => {
		expect(await authorNameIndex.resolve('Someone Else')).toEqual({ asin: 'B00000000F' })
		// A new row with a second ASIN takes the same name → ambiguous
		mockFind.mockImplementation((query: object) => {
			if (Object.keys(query).length === 0) return Promise.resolve([...authorsDb])
			const inFilter = (query as { asin?: { $in?: string[] } }).asin?.$in
			const rows = authorsDb.filter((row) => inFilter?.includes(row.asin))
			return Promise.resolve(
				inFilter?.includes('B00000000K') ? [...rows, { asin: 'B00000000K', name: 'Someone Else' }] : rows
			)
		})
		authorNameIndex.markDirty('B00000000K')
		expect(await authorNameIndex.resolve('Someone Else')).toEqual({
			candidates: ['B00000000F', 'B00000000K']
		})
		// Deleting the second ASIN restores uniqueness
		mockFind.mockImplementation((query: object) => {
			if (Object.keys(query).length === 0) return Promise.resolve([...authorsDb])
			const inFilter = (query as { asin?: { $in?: string[] } }).asin?.$in
			return Promise.resolve(authorsDb.filter((row) => inFilter?.includes(row.asin)))
		})
		authorNameIndex.markDirty('B00000000K')
		expect(await authorNameIndex.resolve('Someone Else')).toEqual({ asin: 'B00000000F' })
	})

	test('refresh removes an alias when it disappears from the row', async () => {
		mockFind.mockImplementation((query: object) => {
			if (Object.keys(query).length === 0) return Promise.resolve([...authorsDb])
			const inFilter = (query as { asin?: { $in?: string[] } }).asin?.$in
			return Promise.resolve(
				authorsDb
					.filter((row) => inFilter?.includes(row.asin))
					.map((row) => (row.asin === 'B00000000I' ? { ...row, aliases: [] } : row))
			)
		})
		authorNameIndex.markDirty('B00000000I')
		expect(await authorNameIndex.resolve('K. Ishiguro')).toEqual({})
		// The canonical name is untouched
		expect(await authorNameIndex.resolve('Kazuo Ishiguro')).toEqual({ asin: 'B00000000I' })
	})

	test('concurrent resolves during a refresh share one ASIN-scoped query', async () => {
		const calls = mockFind.mock.calls.length
		authorNameIndex.markDirty('B00000000D')
		const deferred = Promise.withResolvers<unknown[]>()
		mockFind.mockImplementationOnce(() => deferred.promise)
		const pending = [
			authorNameIndex.resolve('Jason Anspach'),
			authorNameIndex.resolve('Jason Anspach'),
			authorNameIndex.resolve('Nick Cole')
		]
		// All three callers joined the single in-flight refresh
		expect(mockFind.mock.calls.length).toBe(calls + 1)
		const inFilter = (mockFind.mock.calls.at(-1)?.[0] as { asin: { $in: string[] } }).asin.$in
		expect(inFilter).toEqual(['B00000000D'])
		deferred.resolve(authorsDb.filter((row) => row.asin === 'B00000000D'))
		const results = await Promise.all(pending)
		expect(results).toEqual([
			{ asin: 'B00000000D' },
			{ asin: 'B00000000D' },
			{ candidates: ['B00000000E', 'B00000000J'] }
		])
		// A second dirty ASIN triggers its own scoped refresh
		const callsAfter = mockFind.mock.calls.length
		authorNameIndex.markDirty('B00000000E')
		expect(await authorNameIndex.resolve('Nick Cole')).toEqual({
			candidates: ['B00000000E', 'B00000000J']
		})
		expect(mockFind.mock.calls.length).toBe(callsAfter + 1)
	})

	test('a write landing during a refresh goes stale: degrades to not-found, next call refreshes both', async () => {
		const calls = mockFind.mock.calls.length
		authorNameIndex.markDirty('B00000000D')
		const deferred = Promise.withResolvers<unknown[]>()
		mockFind.mockImplementationOnce(() => deferred.promise)
		const pending = authorNameIndex.resolve('Jason Anspach')
		// A second write for a different ASIN invalidates this refresh's
		// generation before it publishes
		authorNameIndex.markDirty('B00000000E')
		// The refresh completes with B00000000D's rows; it must not publish
		// because its generation is stale (B00000000E is still dirty)
		deferred.resolve(authorsDb.filter((row) => row.asin === 'B00000000D'))
		// One refresh per call: a dirty index is never served
		expect(await pending).toEqual({})
		expect(mockFind.mock.calls.length).toBe(calls + 1)
		// Next lookup: one scoped refresh covering both dirty ASINs
		expect(await authorNameIndex.resolve('Jason Anspach')).toEqual({ asin: 'B00000000D' })
		expect(mockFind.mock.calls.length).toBe(calls + 2)
		const lastQuery = mockFind.mock.calls.at(-1)?.[0] as { asin: { $in: string[] } }
		expect(lastQuery.asin.$in).toEqual(['B00000000D', 'B00000000E'])
	})

	test('a concurrent markDirty + stale refresh leaves the published index unmutated', async () => {
		// Intermediate DB state: a new row B00000000K takes the folded name
		// 'nick cole'; final state: that row is deleted again
		const kRow = { asin: 'B00000000K', name: 'Nick Cole' }
		const deferredIntermediate = Promise.withResolvers<typeof authorsDb>()
		const deferredFinal = Promise.withResolvers<typeof authorsDb>()
		mockFind.mockImplementation((query: object) => {
			if (Object.keys(query).length === 0) return Promise.resolve([...authorsDb])
			const inFilter = (query as { asin?: { $in?: string[] } }).asin?.$in ?? []
			// [K]: the first (stale) refresh reads the intermediate state
			if (inFilter.length === 1 && inFilter[0] === 'B00000000K') {
				return deferredIntermediate.promise
			}
			// [K, E]: the follow-up refresh reads the final state
			if (inFilter.length === 2) return deferredFinal.promise
			return Promise.resolve(authorsDb.filter((row) => inFilter.includes(row.asin)))
		})
		authorNameIndex.markDirty('B00000000K')
		// Starts the K refresh; find([K]) is issued synchronously
		const pending = authorNameIndex.resolve('Nick Cole')
		// A write landing during the refresh makes its generation stale
		authorNameIndex.markDirty('B00000000E')
		// The stale refresh reads K's intermediate row and completes
		// without publishing (generation mismatch)
		deferredIntermediate.resolve([...authorsDb, kRow])
		// Settles once the stale refresh has fully completed; the dirty
		// state is retained, so the call degrades to not-found
		expect(await pending).toEqual({})
		// The published index is untouched: the stale refresh's staged
		// mutation of the shared 'nick cole' Set left no trace (a
		// shared-Set mutation would have added B00000000K)
		expect(liveIndex().get('nick cole')).toEqual(new Set(['B00000000E', 'B00000000J']))
		// The subsequent refresh covers both dirty ASINs and reads the
		// final state: the intermediate name is gone with no residue
		deferredFinal.resolve(authorsDb)
		expect(await authorNameIndex.resolve('Nick Cole')).toEqual({
			candidates: ['B00000000E', 'B00000000J']
		})
		expect(liveIndex().get('nick cole')).toEqual(new Set(['B00000000E', 'B00000000J']))
	})

	test('a failed refresh degrades to not-found, keeps dirty state, and retries scoped (no full load)', async () => {
		const spy = spyOn(authorNameIndex.logger, 'error').mockImplementation(() => undefined)
		authorNameIndex.markDirty('B00000000D')
		mockFind.mockImplementationOnce(() => Promise.reject(new Error('db down')))
		// One refresh attempt per call: not-found, dirty state retained
		expect(await authorNameIndex.resolve('Jason Anspach')).toEqual({})
		expect(spy).toHaveBeenCalledTimes(1)
		// Next lookup: one more scoped refresh, never a {} full reload
		const callsAfterFailure = mockFind.mock.calls.length
		expect(await authorNameIndex.resolve('Jason Anspach')).toEqual({ asin: 'B00000000D' })
		expect(mockFind.mock.calls.length).toBe(callsAfterFailure + 1)
		expect(mockFind.mock.calls.at(-1)?.[0]).toEqual({ asin: { $in: ['B00000000D'] } })
	})

	test('invalidate still discards a warm index for a full rebuild', async () => {
		const calls = mockFind.mock.calls.length
		authorNameIndex.invalidate()
		expect(await authorNameIndex.resolve('Jason Anspach')).toEqual({ asin: 'B00000000D' })
		expect(mockFind.mock.calls.length).toBe(calls + 1)
		expect(mockFind.mock.calls.at(-1)?.[0]).toEqual({})
	})

	test('isReady recognizes initialized AuthorModel.find', () => {
		// papr's uninitialized models expose an abstract `find` named
		// 'abstractMethod'; initialization replaces it with a real function
		const abstractFind = function abstractMethod() {
			throw new Error('Collection is not initialized!')
		}
		const model = AuthorModel as unknown as { find: unknown }
		const realFind = model.find
		try {
			model.find = abstractFind
			expect(authorNameIndex.isReady()).toBe(false)
		} finally {
			model.find = realFind
		}
		expect(authorNameIndex.isReady()).toBe(true)
	})
})

afterEach(() => {
	mock.restore()
})
