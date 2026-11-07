import { describe, expect, test } from 'bun:test'

import { isBookHistoryEnabled } from '#config/bookHistory'

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
