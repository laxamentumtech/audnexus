import { describe, expect, test } from 'bun:test'

import { isBookHistoryEnabled } from '#config/bookHistory'
import { DATABASE_INDEXES } from '#config/databaseIndexes'

const historyIndexes = DATABASE_INDEXES.filter((index) => index.requiredBy.includes('history')).map(({ collection, name, keys, options }) => ({ collection, name, keys, ...options }))

describe('isBookHistoryEnabled', () => {
	test('unset and blank values are disabled', () => {
		expect(isBookHistoryEnabled({})).toBe(false)
		expect(isBookHistoryEnabled({ BOOK_HISTORY_ENABLED: '' })).toBe(false)
		expect(isBookHistoryEnabled({ BOOK_HISTORY_ENABLED: '   ' })).toBe(false)
	})

	test('the literal true enables and false disables (surrounding whitespace allowed)', () => {
		expect(isBookHistoryEnabled({ BOOK_HISTORY_ENABLED: 'true' })).toBe(true)
		expect(isBookHistoryEnabled({ BOOK_HISTORY_ENABLED: ' true ' })).toBe(true)
		expect(isBookHistoryEnabled({ BOOK_HISTORY_ENABLED: 'false' })).toBe(false)
		expect(isBookHistoryEnabled({ BOOK_HISTORY_ENABLED: 'false ' })).toBe(false)
	})

	test('any other supplied value throws a startup error', () => {
		for (const value of ['1', '0', 'yes', 'on', 'TRUE', 'True', 'falsey']) {
			expect(
				() => isBookHistoryEnabled({ BOOK_HISTORY_ENABLED: value }),
				`expected throw for ${JSON.stringify(value)}`
			).toThrow('BOOK_HISTORY_ENABLED must be true or false')
		}
	})
})

describe('historyIndexes', () => {
	test('defines the expected named indexes on the history collections', () => {
		const byName = new Map(historyIndexes.map((d) => [d.name, d]))
		// The unique revision key: one revision per (asin, region, revision),
		// the write path's at-most-one-revision guarantee.
		expect(byName.get('history_revision')).toEqual({
			collection: 'book_history_revisions',
			name: 'history_revision',
			keys: { asin: 1, region: 1, revision: 1 },
			unique: true
		})
		// The filtered-field listing key (newest first per changed field).
		expect(byName.get('history_field')).toEqual({
			collection: 'book_history_revisions',
			name: 'history_field',
			keys: { asin: 1, region: 1, changedFields: 1, revision: -1 }
		})
		// Gallery uniqueness: recognized IDs and unparsed URLs are each
		// unique per (asin, region), partial so a doc with neither is free.
		expect(byName.get('artwork_image')).toEqual({
			collection: 'book_artwork',
			name: 'artwork_image',
			keys: { asin: 1, region: 1, imageId: 1 },
			unique: true,
			partialFilterExpression: { imageId: { $type: 'string' } }
		})
		expect(byName.get('artwork_unparsed')).toEqual({
			collection: 'book_artwork',
			name: 'artwork_unparsed',
			keys: { asin: 1, region: 1, unparsedKey: 1 },
			unique: true,
			partialFilterExpression: { unparsedKey: { $type: 'string' } }
		})
		// One immutable sequence per (asin, region): the assetSequence
		// allocator's no-collision guarantee.
		expect(byName.get('artwork_order')).toEqual({
			collection: 'book_artwork',
			name: 'artwork_order',
			keys: { asin: 1, region: 1, sequence: 1 },
			unique: true
		})
		// Identity resolution by asin+region on the current collection.
		expect(byName.get('history_book_lookup')).toEqual({
			collection: 'books',
			name: 'history_book_lookup',
			keys: { asin: 1, region: 1 }
		})
		// Exactly these six: states and seed progress ride the built-in
		// `_id_` index and must not be defined here.
		expect([...byName.keys()].sort()).toEqual([
			'artwork_image',
			'artwork_order',
			'artwork_unparsed',
			'history_book_lookup',
			'history_field',
			'history_revision'
		])
		expect(
			historyIndexes.filter((d) =>
				['book_history_states', 'book_history_seed_progress'].includes(d.collection)
			)
		).toEqual([])
	})
})
