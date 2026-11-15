// Unit coverage for the activation gate's failure branches. The store is
// exercised in-process against a mocked MongoClient (no Docker, no replica
// set): each case drives one failure of `assertHistoryPrerequisites` and
// asserts the stable startup error, while a fully prepared client passes.

import { describe, expect, test } from 'bun:test'
import { ObjectId } from 'mongodb'

import { HISTORY_INDEX_DEFINITIONS } from '#config/bookHistory'
import { BookHistoryStore } from '#helpers/database/papr/BookHistoryStore'

const FAILURE =
	'BOOK_HISTORY_ENABLED requires a transaction-capable MongoDB replica set and prepared history indexes'

interface IndexDoc {
	name: string
	key: Record<string, number>
	unique?: boolean
	partialFilterExpression?: Record<string, unknown>
}

/** All prepared index definitions exactly as `prepare` creates them. */
const preparedIndexes: Record<string, IndexDoc[]> = {}
for (const def of HISTORY_INDEX_DEFINITIONS) {
	preparedIndexes[def.collection] ??= []
	preparedIndexes[def.collection].push({
		name: def.name,
		key: { ...def.keys },
		...(def.unique === true ? { unique: true } : {}),
		...(def.partialFilterExpression ? { partialFilterExpression: def.partialFilterExpression } : {})
	})
}

interface MongoShape {
	db(name: string): {
		command(cmd: object): Promise<{ setName?: string } | never>
		collection(name: string): {
			listIndexes(): { toArray(): Promise<IndexDoc[]> }
			insertOne(doc: object, opts?: object): Promise<unknown>
			deleteOne(filter: object, opts?: object): Promise<unknown>
			findOne(filter: object, opts?: object): Promise<unknown>
			updateOne(filter: object, update: object, opts?: object): Promise<unknown>
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
						return { matchedCount: options.stateUpdateMatchedCount ?? 1 }
					}
					return {}
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
			stateDoc: { _id: 'us:B079LRSMNN', acceptedGeneration: 5, deleteFence: 0 }
		})
		const modified = await store.persistRatingsRepair(input)
		expect(modified).toBe(1)
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

	test('writes zero rows and aborts the books write when the fence is lost', async () => {
		// A concurrent accepted-watermark advance in between the
		// persistObservation proof and the repair makes the state fence
		// match 0: the repair must not touch the book document and the
		// transaction aborts before commit.
		const { store, calls } = clientWith({
			stateDoc: { _id: 'us:B079LRSMNN', acceptedGeneration: 12, deleteFence: 0 },
			stateUpdateMatchedCount: 0
		})
		await expect(store.persistRatingsRepair(input)).rejects.toThrow('superseded')
		expect(calls.booksUpdateOne).toHaveLength(0)
	})

	test('omits the fence when no history state exists (nothing can supersede the generation)', async () => {
		const { store, calls } = clientWith({ stateDoc: null })
		const modified = await store.persistRatingsRepair(input)
		expect(modified).toBe(1)
		expect(calls.stateUpdateOne).toHaveLength(0)
		expect(calls.booksUpdateOne[0].filter).toEqual({
			_id: input.bookId,
			ratings: { $exists: false }
		})
	})

	test('propagates a 0-modified outcome (concurrent writer won)', async () => {
		const { store } = clientWith({ updateOneResult: { modifiedCount: 0 } })
		await expect(store.persistRatingsRepair(input)).resolves.toBe(0)
	})
})
