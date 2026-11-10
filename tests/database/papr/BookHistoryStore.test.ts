// Unit coverage for the activation gate's failure branches. The store is
// exercised in-process against a mocked MongoClient (no Docker, no replica
// set): each case drives one failure of `assertHistoryPrerequisites` and
// asserts the stable startup error, while a fully prepared client passes.

import { describe, expect, test } from 'bun:test'

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
}): { client: MongoShape; store: BookHistoryStore } {
	const indexes = options.indexes ?? preparedIndexes
	const store = new BookHistoryStore()
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
				deleteOne: async () => ({})
			})
		}),
		startSession: async () => ({
			withTransaction: async (fn: (session: { db: () => never }) => Promise<unknown>) =>
				fn({}),
			endSession: async () => {}
		})
	}
	store.configure(client as never)
	return { client, store }
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

	test('fails when a prepared index is missing', async () => {
		const indexes = mutateIndex('book_history_revisions', 'history_revision', (idx) => {
			idx.name = 'renamed-away'
		})
		const { store } = clientWith({ indexes })
		await expect(store.assertHistoryPrerequisites()).rejects.toThrow(FAILURE)
	})

	test('fails on a key mismatch for a same-name index', async () => {
		const indexes = mutateIndex('book_history_revisions', 'history_revision', (idx) => {
			idx.key = { asin: 1, region: 1, revision: -1 }
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
