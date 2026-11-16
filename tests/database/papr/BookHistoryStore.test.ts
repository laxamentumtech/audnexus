// Unit coverage for the activation gate's failure branches. The store is
// exercised in-process against a mocked MongoClient (no Docker, no replica
// set): each case drives one failure of `assertHistoryPrerequisites` and
// asserts the stable startup error, while a fully prepared client passes.

import { describe, expect, test } from 'bun:test'
import { ObjectId } from 'mongodb'

import { DATABASE_INDEXES } from '#config/databaseIndexes'
import { BookHistoryStore } from '#helpers/database/papr/BookHistoryStore'

const FAILURE =
	'BOOK_HISTORY_ENABLED requires a transaction-capable MongoDB replica set and prepared history indexes'

interface IndexDoc {
	name: string
	key: Record<string, number | 'text'>
	unique?: boolean
	partialFilterExpression?: Record<string, unknown>
}

/** All prepared index definitions exactly as `prepare` creates them. */
const preparedIndexes: Record<string, IndexDoc[]> = {}
for (const def of DATABASE_INDEXES.filter((index) => index.requiredBy.includes('history'))) {
	preparedIndexes[def.collection] ??= []
	preparedIndexes[def.collection].push({
		name: def.name,
		key: { ...def.keys },
		...(def.options.unique === true ? { unique: true } : {}),
		...(def.options.partialFilterExpression ? { partialFilterExpression: def.options.partialFilterExpression } : {})
	})
}

interface MongoShape {
	db(name: string): {
		command(cmd: object): Promise<{ setName?: string } | never>
		listCollections(filter: { name: string }): { toArray(): Promise<unknown[]> }
		runCursorCommand(cmd: { listIndexes: string }): { toArray(): Promise<IndexDoc[]> }
		collection(name: string): {
			listIndexes(): { toArray(): Promise<IndexDoc[]> }
			insertOne(doc: object, opts?: object): Promise<unknown>
			deleteOne(filter: object, opts?: object): Promise<unknown>
			findOne(filter: object, opts?: object): Promise<unknown>
			updateOne(filter: object, update: object, opts?: object): Promise<unknown>
			countDocuments(filter: object, opts?: object): Promise<number>
			find(filter: object, opts?: object): {
				sort(spec: object): { limit(n: number): { toArray(): Promise<unknown[]> } }
				limit(n: number): { sort(spec: object): { toArray(): Promise<unknown[]> } }
				toArray(): Promise<unknown[]>
			}
		}
	}
	startSession(): Promise<{
		withTransaction<T>(fn: (session: { db: () => never }) => Promise<T>): Promise<T>
		endSession(): Promise<void>
	}>
}

/**
 * Build a client mock whose replica set and index state are under test
 * control. `mutate` tweaks the prepared index state per collection before
 * the probe runs; the transaction probe succeeds by default and can be
 * forced to reject.
 */
function clientWith(options: {
	indexes?: Record<string, IndexDoc[]>
	rejectHello?: boolean
	noSetName?: boolean
	rejectTx?: boolean
	stateDoc?: unknown
	updateOneResult?: { modifiedCount: number }
	stateUpdateMatchedCount?: number
	/** Make the STATE document's conditional update throw (a write conflict
	 * from a concurrent acceptance) so the transaction aborts. */
	abortOnStateWrite?: Error
	/** Book rows visible to identity resolution (count + find). */
	currentBooks?: unknown[]
	/** Count per identity-resolution filter (exact vs competitor). */
	booksCount?: (filter: object) => number
}): {
	client: MongoShape
	store: BookHistoryStore
	calls: {
		stateFindOne: object[]
		stateUpdateOne: { filter: object; update: object; opts?: object }[]
		booksUpdateOne: { filter: object; update: object; opts?: object }[]
	}
} {
	const indexes = options.indexes ?? preparedIndexes
	const store = new BookHistoryStore()
	const calls = {
		stateFindOne: [] as object[],
		stateUpdateOne: [] as { filter: object; update: object; opts?: object }[],
		booksUpdateOne: [] as { filter: object; update: object; opts?: object }[]
	}
	const client: MongoShape = {
		db: (name: string) => ({
			command: async () => {
				if (options.rejectHello) throw new Error('not a replica set')
				if (options.noSetName) return {}
				if (name === 'admin') return { setName: 'rs0' }
				return {}
			},
			listCollections: () => ({ toArray: async () => [] }),
			runCursorCommand: (cmd) => ({ toArray: async () => indexes[cmd.listIndexes] ?? [] }),
			collection: (collectionName: string) => ({
				listIndexes: () => ({
					toArray: async () => (indexes[collectionName] ?? []).map((idx) => ({ ...idx }))
				}),
				insertOne: async () => {
					if (options.rejectTx) throw new Error('transaction aborted')
				},
				deleteOne: async () => ({}),
				findOne: async (filter: object) => {
					if (collectionName === 'book_history_states') calls.stateFindOne.push(filter)
					return collectionName === 'book_history_states' ? options.stateDoc ?? null : null
				},
				updateOne: async (filter: object, update: object, opts?: object) => {
					if (collectionName === 'books') {
						calls.booksUpdateOne.push({ filter, update, opts })
						return { modifiedCount: options.updateOneResult?.modifiedCount ?? 1 }
					}
					if (collectionName === 'book_history_states') {
						calls.stateUpdateOne.push({ filter, update, opts })
						if (options.abortOnStateWrite) throw options.abortOnStateWrite
						return { matchedCount: options.stateUpdateMatchedCount ?? 1 }
					}
					return {}
				},
				countDocuments: async (filter: object) =>
					options.booksCount ? options.booksCount(filter) : 0,
				find: () => {
					const docs = options.currentBooks ?? []
					const end = { toArray: async () => docs }
					return {
						sort: () => ({ limit: () => end }),
						limit: () => ({ sort: () => end }),
						toArray: async () => docs
					}
				}
			})
		}),
		startSession: async () => ({
			withTransaction: async (fn: (session: { db: () => never }) => Promise<unknown>) =>
				fn({}),
			endSession: async () => {}
		})
	}
	store.configure(client as never)
	return { client, store, calls }
}

/** Force one prepared index definition to mismatch the store's comparison. */
function mutateIndex(collection: string, name: string, mutate: (idx: IndexDoc) => void): Record<string, IndexDoc[]> {
	const indexes: Record<string, IndexDoc[]> = {}
	for (const [col, docs] of Object.entries(preparedIndexes)) {
		indexes[col] = docs.map((idx) => {
			const copy = { ...idx, key: { ...idx.key } }
			if (col === collection && idx.name === name) mutate(copy)
			return copy
		})
	}
	return indexes
}

describe('assertHistoryPrerequisites', () => {
	test('passes when the replica set and every prepared index match', async () => {
		const { store } = clientWith({})
		await expect(store.assertHistoryPrerequisites()).resolves.toBeUndefined()
	})

	test('fails when the hello command rejects (no replica set)', async () => {
		const { store } = clientWith({ rejectHello: true })
		await expect(store.assertHistoryPrerequisites()).rejects.toThrow(FAILURE)
	})

	test('fails when hello reports no setName', async () => {
		const { store } = clientWith({ noSetName: true })
		await expect(store.assertHistoryPrerequisites()).rejects.toThrow(FAILURE)
	})

	test('fails when a prepared index is missing entirely', async () => {
		// Rename AND break the keys: an equivalent index under another name
		// satisfies the definition, so a genuinely missing one must differ.
		const indexes = mutateIndex('book_history_revisions', 'history_revision', (idx) => {
			idx.name = 'renamed-away'
			idx.key = { asin: 1, region: 1, revision: -1 }
		})
		const { store } = clientWith({ indexes })
		await expect(store.assertHistoryPrerequisites()).rejects.toThrow(FAILURE)
	})

	test('adopts equivalent production book lookup names', async () => {
		const indexes = mutateIndex('books', 'history_book_lookup', (idx) => { idx.name = 'asin_1_region_1' })
		const { store } = clientWith({ indexes })
		await expect(store.assertHistoryPrerequisites()).resolves.toBeUndefined()
	})

	test('passes when an equivalent index exists under another name', async () => {
		const indexes = mutateIndex('book_history_revisions', 'history_revision', (idx) => {
			idx.name = 'generated-name'
		})
		const { store } = clientWith({ indexes })
		await expect(store.assertHistoryPrerequisites()).resolves.toBeUndefined()
	})

	test('fails on a key mismatch for a same-name index', async () => {
		const indexes = mutateIndex('book_history_revisions', 'history_revision', (idx) => {
			idx.key = { asin: 1, region: 1, revision: -1 }
		})
		const { store } = clientWith({ indexes })
		await expect(store.assertHistoryPrerequisites()).rejects.toThrow(FAILURE)
	})

	test('fails on a reordered same-name index (key order determines the prefix)', async () => {
		// Same fields+directions, different ORDER: an unordered key
		// comparison would accept it, but {region:1, asin:1, revision:1}
		// cannot serve the {asin:1, region:1, revision:1} prefix scan.
		const indexes = mutateIndex('book_history_revisions', 'history_revision', (idx) => {
			idx.key = { region: 1, asin: 1, revision: 1 }
		})
		const { store } = clientWith({ indexes })
		await expect(store.assertHistoryPrerequisites()).rejects.toThrow(FAILURE)
	})

	test('fails when the unique flag is missing on a non-_id unique index', async () => {
		const indexes = mutateIndex('book_history_revisions', 'history_revision', (idx) => {
			delete idx.unique
		})
		const { store } = clientWith({ indexes })
		await expect(store.assertHistoryPrerequisites()).rejects.toThrow(FAILURE)
	})

	test('fails when a non-unique index is unique', async () => {
		const indexes = mutateIndex('books', 'history_book_lookup', (idx) => {
			idx.unique = true
		})
		const { store } = clientWith({ indexes })
		await expect(store.assertHistoryPrerequisites()).rejects.toThrow(FAILURE)
	})

	test('fails on a missing partial filter expression', async () => {
		const indexes = mutateIndex('book_artwork', 'artwork_image', (idx) => {
			delete idx.partialFilterExpression
		})
		const { store } = clientWith({ indexes })
		await expect(store.assertHistoryPrerequisites()).rejects.toThrow(FAILURE)
	})

	test('fails on a different partial filter expression', async () => {
		const indexes = mutateIndex('book_artwork', 'artwork_image', (idx) => {
			idx.partialFilterExpression = { imageId: { $type: 'string' }, unparsedKey: { $exists: true } }
		})
		const { store } = clientWith({ indexes })
		await expect(store.assertHistoryPrerequisites()).rejects.toThrow(FAILURE)
	})

	test('fails when the transactional probe cannot commit', async () => {
		const { store } = clientWith({ rejectTx: true })
		await expect(store.assertHistoryPrerequisites()).rejects.toThrow(FAILURE)
	})
})

describe('persistRatingsRepair', () => {
	const input = {
		asin: 'B079LRSMNN',
		region: 'us',
		generation: 9,
		bookId: new ObjectId('5c8f8f8f8f8f8f8f8f8f8f01'),
		ratings: { value: '4.6', numRatings: 120, numReviews: 8 }
	}

	test('enforces the generation fence on the state document, not the books filter', async () => {
		// A state document exists (a reserved history state): the fence is
		// a conditional update on book_history_states, atomically in the
		// same transaction as the books write.
		const { store, calls } = clientWith({
			stateDoc: {
				_id: 'us:B079LRSMNN',
				acceptedGeneration: 5,
				deleteFence: 0,
				stateVersion: 4
			}
		})
		const result = await store.persistRatingsRepair(input)
		expect(result).toEqual({ modified: 1, superseded: false })
		// The fence (acceptedGeneration AND deleteFence below the repaired
		// generation — the persistObservation stale inequality inverted)
		// is re-asserted on the STATE document, in the same transaction
		// (same session) as the books write.
		expect(calls.stateUpdateOne).toHaveLength(1)
		expect(calls.stateUpdateOne[0].filter).toEqual({
			_id: 'us:B079LRSMNN',
			acceptedGeneration: { $lt: 9 },
			deleteFence: { $lt: 9 }
		})
		expect(calls.stateUpdateOne[0].opts).toEqual({ session: {} })
		// The fence update is a REAL document modification — an increment
		// of stateVersion, the store's state-advance convention. A no-op
		// $set of the read value establishes no write conflict, so a
		// superseded generation could pass the fence and a newer generation
		// advance the watermarks before the repair commits.
		expect(calls.stateUpdateOne[0].update).toEqual({ $inc: { stateVersion: 1 } })
		// The books filter stays on book-document fields only: normal book
		// documents lack the watermarks, so a fence spread into this
		// filter would match zero rows with history enabled.
		expect(calls.booksUpdateOne).toHaveLength(1)
		expect(calls.booksUpdateOne[0].filter).toEqual({
			_id: input.bookId,
			ratings: { $exists: false }
		})
		expect(calls.booksUpdateOne[0].update).toEqual({
			$set: { ratings: input.ratings },
			$unset: { ratingsBackfillSkip: '' },
			$currentDate: { updatedAt: true }
		})
		// Legacy stubs fail the strict validator for unrelated missing
		// content fields: the repair bypasses validation, nothing else does.
		expect(calls.booksUpdateOne[0].opts).toEqual({ session: {}, bypassDocumentValidation: true })
	})

	test('returns superseded and writes no book rows when the fence is lost', async () => {
		// A concurrent accepted-watermark advance in between the
		// persistObservation proof and the repair makes the state fence
		// match 0: the repair must not touch the book document, and the
		// lost fence is a RESULT (`superseded: true`), not a throw — the
		// batch flow tallies it as a race, not a failure.
		const { store, calls } = clientWith({
			stateDoc: { _id: 'us:B079LRSMNN', acceptedGeneration: 12, deleteFence: 0 },
			stateUpdateMatchedCount: 0
		})
		await expect(store.persistRatingsRepair(input)).resolves.toEqual({
			modified: 0,
			superseded: true
		})
		expect(calls.booksUpdateOne).toHaveLength(0)
	})

	test('aborts the whole transaction when a concurrent acceptance conflicts with the fence write', async () => {
		// Concurrency regression: a newer generation accepts an EQUAL
		// projection after the fence read but before the books write. The
		// fence's $inc and the acceptance's watermark advance are
		// concurrent writes to the same state row, so the repair's
		// snapshot transaction aborts on the write conflict and the books
		// write never commits — the repair is superseded, not written.
		const { store, calls } = clientWith({
			stateDoc: {
				_id: 'us:B079LRSMNN',
				acceptedGeneration: 5,
				deleteFence: 0,
				stateVersion: 4
			},
			abortOnStateWrite: new Error('write conflict')
		})
		await expect(store.persistRatingsRepair(input)).rejects.toThrow('write conflict')
		expect(calls.booksUpdateOne).toHaveLength(0)
	})

	test('omits the fence when no history state exists (nothing can supersede the generation)', async () => {
		const { store, calls } = clientWith({ stateDoc: null })
		const result = await store.persistRatingsRepair(input)
		expect(result).toEqual({ modified: 1, superseded: false })
		expect(calls.stateUpdateOne).toHaveLength(0)
		expect(calls.booksUpdateOne[0].filter).toEqual({
			_id: input.bookId,
			ratings: { $exists: false }
		})
	})

	test('propagates a 0-modified outcome (concurrent writer won)', async () => {
		const { store } = clientWith({ updateOneResult: { modifiedCount: 0 } })
		await expect(store.persistRatingsRepair(input)).resolves.toEqual({
			modified: 0,
			superseded: false
		})
	})
})

describe('persistObservation genre preservation', () => {
	const asin = 'B079LRSMNN'
	const region = 'us'
	const bookId = new ObjectId('5c8f8f8f8f8f8f8f8f8f8f01')
	const genres = [{ asin: '1234567890', name: 'Fiction', type: 'genre' }]

	/** A full, schema-valid book for the incoming observation. */
	function validBook(overrides: Record<string, unknown> = {}) {
		return {
			asin,
			authors: [{ asin: 'B079LRSMNN', name: 'Smith, Doe' }],
			description: 'desc',
			formatType: 'audiobook',
			image: 'https://m.media-amazon.com/images/I/legacy.jpg',
			isAdult: false,
			language: 'en',
			publisherName: 'Publisher',
			rating: '4.5',
			region,
			releaseDate: new Date('2020-01-01T00:00:00.000Z'),
			runtimeLengthMin: 600,
			summary: 'summary',
			title: 'Original Title',
			...overrides
		}
	}

	test('keeps stored genres on a legacy row missing a required field when the incoming observation is genre-less', async () => {
		// Regression: the genre-preserving merge was nested in the
		// `oldApi` guard (the stored row validating as a full ApiBook). A
		// legacy row with genres but a missing required field (e.g.
		// description) fails that validation, so the merge was skipped and
		// an incoming `genres: []` observation cleared the stored genres on
		// the write (the safeguard was skipped by the same guard, so the
		// clear went through). The merge must apply whenever the stored
		// row carries non-empty genres and the incoming book has no genre
		// evidence.
		const legacyDoc = {
			_id: bookId,
			...validBook(),
			genres
		}
		delete (legacyDoc as Record<string, unknown>).description
		const { store, calls } = clientWith({
			currentBooks: [legacyDoc],
			booksCount: (filter: object) =>
				JSON.stringify(filter) === JSON.stringify({ asin, region }) ? 1 : 0
		})
		const now = new Date('2026-11-16T00:00:00.000Z')
		const result = await store.persistObservation({
			asin,
			region,
			generation: 3,
			book: validBook({ title: 'Renamed Title', genres: [] }),
			observation: {
				observedAt: now,
				apiReceivedAt: now,
				responseGroups: ['product_desc'],
				requestedRenditions: ['default'],
				fields: [
					{
						field: 'title',
						policy: 'editorial:title:v1',
						value: { state: 'value', value: 'Renamed Title' },
						source: 'audible_api'
					}
				],
				artwork: []
			}
		})
		expect(result.disposition).toBe('accepted')
		expect(result.modified).toBe(true)
		expect(calls.booksUpdateOne).toHaveLength(1)
		const update = calls.booksUpdateOne[0].update as {
			$set: Record<string, unknown>
		}
		// The changed title persists WITH the stored genres intact — the
		// genre-less `genres: []` did not clear them.
		expect(update.$set.title).toBe('Renamed Title')
		expect(update.$set.genres).toEqual(genres)
		// The legacy row lacked the validator-required createdAt, so the
		// write supplies it once.
		expect(update.$set.createdAt).toBeInstanceOf(Date)
		// The stored projection that never validated is not what the
		// write carries: the returned data is the merged projection.
		expect(result.data).toMatchObject({ title: 'Renamed Title', genres })
	})
})
