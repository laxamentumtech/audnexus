import { describe, expect, test } from 'bun:test'

import {
	canonicalJson,
	decodeArtworkCursor,
	decodeCursor,
	encodeArtworkCursor,
	encodeCursor,
	HISTORY_CURSOR_MAX_LENGTH
} from '#helpers/books/historyCursor'

const asin = 'B00TEST123'
const region = 'us'
const OTHER_ASIN = 'B00OTHER45'

describe('historyCursor', () => {
	test('canonicalJson sorts keys recursively', () => {
		expect(canonicalJson({ b: 1, a: { d: 4, c: [3, 2] } })).toBe('{"a":{"c":[3,2],"d":4},"b":1}')
		expect(canonicalJson(null)).toBe('null')
		expect(canonicalJson('x')).toBe('"x"')
		expect(() => canonicalJson(() => undefined)).toThrow('Invalid cursor value')
	})

	test('encode/decode round-trip preserves bounds', () => {
		const cursor = encodeCursor(asin, region, 'artwork', 42, 40)
		expect(decodeCursor(cursor, asin, region, 'artwork')).toEqual({ upper: 42, before: 40 })
	})

	test('decode returns null for no cursor', () => {
		expect(decodeCursor(undefined, asin, region, null)).toBeNull()
		expect(decodeArtworkCursor(undefined, asin, region)).toBeNull()
	})

	test('rejects cross-book and cross-region reuse', () => {
		const cursor = encodeCursor(asin, region, null, 7, 5)
		expect(() => decodeCursor(cursor, OTHER_ASIN, region, null)).toThrow('Cursor does not match book')
		expect(() => decodeCursor(cursor, asin, 'de', null)).toThrow('Cursor does not match book')
	})

	test('rejects field filter mismatch', () => {
		const cursor = encodeCursor(asin, region, 'title', 7, 5)
		expect(() => decodeCursor(cursor, asin, region, null)).toThrow('Cursor does not match filter')
		expect(() => decodeCursor(cursor, asin, region, 'artwork')).toThrow('Cursor does not match filter')
		expect(decodeCursor(cursor, asin, region, 'title')).toEqual({ upper: 7, before: 5 })
	})

	test('rejects kind mismatch (artwork cursor on history and vice versa)', () => {
		const history = encodeCursor(asin, region, null, 7, 5)
		const artwork = encodeArtworkCursor(asin, region, 9, 4)
		expect(() => decodeCursor(artwork, asin, region, null)).toThrow('Invalid cursor')
		expect(() => decodeArtworkCursor(history, asin, region)).toThrow('Invalid cursor')
		expect(decodeArtworkCursor(artwork, asin, region)).toEqual({ upper: 9, before: 4 })
	})

	test('rejects malformed cursors', () => {
		expect(() => decodeCursor('%%%not-base64%%%', asin, region, null)).toThrow('Invalid cursor')
		// base64 (with '+') is not base64url
		const plus = Buffer.from('{"a":1}').toString('base64')
		expect(() => decodeCursor(plus, asin, region, null)).toThrow('Invalid cursor')
		// non-canonical payload (unsorted keys)
		const nonCanonical = Buffer.from(`{"v":1,"kind":"history","asin":"${asin}"}`, 'utf8').toString('base64url')
		expect(() => decodeCursor(nonCanonical, asin, region, null)).toThrow('Invalid cursor')
		// truncated payload
		const truncated = Buffer.from('{"v":1', 'utf8').toString('base64url')
		expect(() => decodeCursor(truncated, asin, region, null)).toThrow('Invalid cursor')
		// wrong version
		const badVersion = Buffer.from(
			JSON.stringify({ v: 2, kind: 'history', asin, region, field: null, upper: 1, before: 2 }),
			'utf8'
		).toString('base64url')
		expect(() => decodeCursor(badVersion, asin, region, null)).toThrow('Invalid cursor')
	})

	test('rejects oversized input', () => {
		const cursor = encodeCursor(asin, region, null, 1, 2)
		const oversized = `${cursor}${'a'.repeat(HISTORY_CURSOR_MAX_LENGTH)}`
		expect(oversized.length).toBeGreaterThan(HISTORY_CURSOR_MAX_LENGTH)
		expect(() => decodeCursor(oversized, asin, region, null)).toThrow('Invalid cursor')
	})

	test('rejects out-of-range values after decode', () => {
		const bad = Buffer.from(
			JSON.stringify({
				v: 1,
				kind: 'history',
				asin,
				region,
				field: null,
				upper: Number.MAX_SAFE_INTEGER + 1,
				before: 1
			}),
			'utf8'
		).toString('base64url')
		// Non-canonical? It is canonical JSON; value must fail the safe check.
		expect(() => decodeCursor(bad, asin, region, null)).toThrow('Invalid cursor')
	})

	test('encode requires positive before and safe upper', () => {
		expect(() => encodeCursor(asin, region, null, 0, 0)).toThrow('Invalid cursor value')
		expect(() => encodeCursor(asin, region, null, -1, 5)).toThrow('Invalid cursor value')
		expect(() => encodeCursor(asin, region, null, 1, 1.5)).toThrow('Invalid cursor value')
		expect(() => encodeArtworkCursor(asin, region, 3, -5)).toThrow('Invalid cursor value')
		expect(encodeCursor(asin, region, null, 0, 1)).toBeDefined()
	})

	test('cursor material derives solely from the identity payload', () => {
		expect(encodeCursor(asin, region, 'title', 3, 2)).toBe(
			Buffer.from(
				'{"asin":"B00TEST123","before":2,"field":"title","kind":"history","region":"us","upper":3,"v":1}',
				'utf8'
			).toString('base64url')
		)
	})
})
