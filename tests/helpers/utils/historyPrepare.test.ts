import { beforeEach, describe, expect, mock, test } from 'bun:test'

// `prepare` connects directly to MONGODB_URI; stub papr initialization so
// the test exercises the index predicates against a stubbed client.
mock.module('#config/papr', () => ({
	initialize: mock()
}))

import { prepare } from '../../../src/history'

import { HISTORY_INDEX_DEFINITIONS } from '#config/bookHistory'

interface StubIndex {
	name: string
	key: Record<string, number>
	unique?: boolean
	partialFilterExpression?: Record<string, unknown>
}

/** Build a stub client whose collections report the given indexes. */
function stubClient(
	indexesByCollection: Record<string, StubIndex[]>,
	createIndex: Mock
): unknown {
	const collection = mock((name: string) => ({
		listIndexes: mock().mockReturnValue({
			toArray: mock().mockResolvedValue(indexesByCollection[name] ?? [])
		}),
		createIndex
	}))
	return { db: mock().mockReturnValue({ collection }) }
}

/** Build a StubIndex from a definition with FRESH objects: sharing the
 * definition's key object reference would make the comparison trivially
 * true and defeat the regression assertions. */
const exactIndex = (def: (typeof HISTORY_INDEX_DEFINITIONS)[number]): StubIndex => {
	const index: StubIndex = { name: def.name, key: {} }
	for (const [field, direction] of Object.entries(def.keys)) index.key[field] = direction
	if (def.unique !== undefined) index.unique = def.unique
	if (def.partialFilterExpression) index.partialFilterExpression = { ...def.partialFilterExpression }
	return index
}

/** All named indexes present, EXCEPT the given collection's own indexes,
 * which the test supplies (reordered/unique-mismatch variants). */
function baseIndexes(exceptCollection: string): Record<string, StubIndex[]> {
	const byCollection: Record<string, StubIndex[]> = {}
	for (const def of HISTORY_INDEX_DEFINITIONS) {
		if (def.collection === exceptCollection) continue
		byCollection[def.collection] = byCollection[def.collection] ?? []
		byCollection[def.collection].push(exactIndex(def))
	}
	return byCollection
}

beforeEach(() => {
	mock.restore()
})

describe('prepare index equivalence', () => {
	test('accepts an equivalent index under a generated name with matching uniqueness', async () => {
		const createIndex = mock()
		const def = HISTORY_INDEX_DEFINITIONS.find((d) => d.name === 'history_revision')!
		// history_revision under its Mongo auto-generated name. The fixture
		// must NOT carry `def.name`: a same-name index takes the exact-name
		// fast path and the generated-name equivalence branch is never
		// reached (the spread would then overwrite `name` and defeat the
		// test's intent).
		const indexes = baseIndexes('book_history_revisions')
		indexes.book_history_revisions = [
			exactIndex(HISTORY_INDEX_DEFINITIONS.find((d) => d.name === 'history_field')!),
			// Fresh key object (same ordered entries): sharing `def.keys`
			// by reference would make the structural comparison trivially
			// true and defeat the generated-name branch under test.
			{ key: { ...def.keys }, unique: def.unique, name: 'asin_1_region_1_revision_1' }
		]
		await prepare(stubClient(indexes, createIndex) as never)
		expect(createIndex).not.toHaveBeenCalled()
	})

	test('rejects a same-name index with reordered keys (N9 conflict guard)', async () => {
		// The fixture MUST carry the definition's actual name: under any
		// other name prepare never enters the exact-name branch and the
		// same-name guard is not exercised. Same fields, different ORDER:
		// {revision:1, asin:1, region:1} cannot serve the
		// {asin:1, region:1, revision:1} prefix scan, so the named guard
		// must reject the conflicting definition (refuse to replace it)
		// and exit(1) WITHOUT attempting a named creation.
		const def = HISTORY_INDEX_DEFINITIONS.find((d) => d.name === 'history_revision')!
		const createIndex = mock()
		const indexes = baseIndexes('book_history_revisions')
		indexes.book_history_revisions = [
			{ name: def.name, key: { revision: 1, asin: 1, region: 1 }, unique: def.unique },
			exactIndex(HISTORY_INDEX_DEFINITIONS.find((d) => d.name === 'history_field')!)
		]
		const origError = console.error
		const origExit = process.exit
		const errors: unknown[] = []
		let exitCode: number | undefined
		console.error = mock((...args: unknown[]) => {
			errors.push(args)
		}) as never
		process.exit = ((code?: number) => {
			exitCode = code
			throw new Error(`exit:${code}`)
		}) as never
		try {
			await expect(prepare(stubClient(indexes, createIndex) as never)).rejects.toThrow('exit:1')
		} finally {
			console.error = origError
			process.exit = origExit
		}
		expect(exitCode).toBe(1)
		expect(errors).toEqual([
			[
				`index '${def.name}' on book_history_revisions: conflicting definition; refusing to replace it`
			]
		])
		// A conflicting same-name index is never replaced: no creation.
		expect(createIndex).not.toHaveBeenCalled()
	})

	test('rejects a unique index for a non-unique definition (uniqueness must agree)', async () => {
		const createIndex = mock()
		const indexes = baseIndexes('book_history_revisions')
		const fieldDef = HISTORY_INDEX_DEFINITIONS.find((d) => d.name === 'history_field')!
		// A unique generated-name index with the exact key pattern must NOT
		// satisfy the non-unique definition: assertHistoryPrerequisites
		// rejects that match at startup, so prepare must not report it
		// "exists".
		indexes.book_history_revisions = [
			exactIndex(HISTORY_INDEX_DEFINITIONS.find((d) => d.name === 'history_revision')!),
			{ name: 'unique_gen', key: { ...fieldDef.keys }, unique: true }
		]
		await prepare(stubClient(indexes, createIndex) as never)
		expect(createIndex).toHaveBeenCalledTimes(1)
		expect(createIndex).toHaveBeenCalledWith(
			{ ...fieldDef.keys },
			expect.objectContaining({ name: 'history_field' })
		)
	})

	test('still rejects a non-unique index for a unique definition', async () => {
		const createIndex = mock()
		const indexes = baseIndexes('book_history_revisions')
		const def = HISTORY_INDEX_DEFINITIONS.find((d) => d.name === 'history_revision')!
		indexes.book_history_revisions = [
			{ name: 'loose_gen', key: { ...def.keys }, unique: false },
			exactIndex(HISTORY_INDEX_DEFINITIONS.find((d) => d.name === 'history_field')!)
		]
		await prepare(stubClient(indexes, createIndex) as never)
		expect(createIndex).toHaveBeenCalledTimes(1)
		expect(createIndex).toHaveBeenCalledWith(
			{ ...def.keys },
			expect.objectContaining({ name: 'history_revision', unique: true })
		)
	})
})
