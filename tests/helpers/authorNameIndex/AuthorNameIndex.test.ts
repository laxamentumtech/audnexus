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

const mockFind = mock((query: object, options: object) => {
	expect(query).toEqual({})
	expect(options).toEqual({ projection: { asin: 1, name: 1, aliases: 1 } })
	return Promise.resolve([...authorsDb])
})

mock.module('#config/models/Author', () => ({
	default: { find: mockFind }
}))

import { authorNameIndex } from '#helpers/authorNameIndex/AuthorNameIndex'

describe('AuthorNameIndex should', () => {
	beforeEach(async () => {
		// Reset the shared model mock so a persistent mockImplementation from
		// an earlier test cannot leak into this one's build
		mockFind.mockImplementation((query: object, options: object) => {
			expect(query).toEqual({})
			expect(options).toEqual({ projection: { asin: 1, name: 1, aliases: 1 } })
			return Promise.resolve([...authorsDb])
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
})

afterEach(() => {
	mock.restore()
})
