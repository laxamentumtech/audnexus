// Unit coverage for the shared history route guards: the `:asin`
// path parameter is normalized (trimmed) by `AsinSchema` and returned
// verbatim to the caller, while a malformed ASIN is a client-input 400,
// and decode-side cursor failures (not server-side encode failures) are
// the only errors mapped to a 400.

import { describe, expect, test } from 'bun:test'

import { guardCursorErrors, requireValidAsin } from '#config/routes/books/historyRouteGuards'
import { decodeCursor, encodeCursor } from '#helpers/books/historyCursor'
import { BadRequestError } from '#helpers/errors/ApiErrors'
import { MessageBadAsin } from '#static/messages'

describe('requireValidAsin', () => {
	test('returns the trimmed ASIN for a well-formed value', () => {
		// `AsinSchema` is `z.string().trim().regex(asin10Regex)`, so
		// surrounding whitespace is normalized away and the canonical
		// 10-character value is what the caller receives.
		expect(requireValidAsin('  B0ABCDEF01  ')).toBe('B0ABCDEF01')
	})

	test('returns the value unchanged when it is already canonical', () => {
		expect(requireValidAsin('B0ABCDEF01')).toBe('B0ABCDEF01')
	})

	test('throws a 400 BadRequestError for a malformed ASIN', () => {
		expect(() => requireValidAsin('nope')).toThrow(BadRequestError)
		expect(() => requireValidAsin('nope')).toThrow(MessageBadAsin)
	})

	test('trims trailing whitespace as well', () => {
		expect(requireValidAsin('B0ABCDEF01 ')).toBe('B0ABCDEF01')
	})
})

describe('guardCursorErrors', () => {
	test('maps a decode-side cursor failure to a 400 BadRequestError', async () => {
		// `decodeCursor` with a valid-shaped but cross-book cursor payload
		// throws `InvalidCursorError` (identity mismatch), which the guard
		// maps to a client-input 400.
		// Keys in canonical (sorted) order so `strictRecord` accepts the
		// shape and the identity check is what fails.
		const crossBookCursor = Buffer.from(
			JSON.stringify({
				asin: 'B0XYZXYZ99',
				before: 1,
				field: null,
				kind: 'history',
				region: 'us',
				upper: 5,
				v: 1
			}),
			'utf8'
		).toString('base64url')
		await expect(
			guardCursorErrors(() =>
				Promise.resolve(decodeCursor(crossBookCursor, 'B0ABCDEF01', 'us', null))
			)
		).rejects.toBeInstanceOf(BadRequestError)
	})

	test('rethrows a non-cursor error unchanged', async () => {
		// A server-side fault (e.g. a DB outage surfaced as a plain Error)
		// must not be swallowed into a 400.
		const dbError = new Error('MongoServerError: connection refused')
		await expect(
			guardCursorErrors(async () => {
				throw dbError
			})
		).rejects.toBe(dbError)
	})

	test('rethrows an encode-side cursor error unchanged (not a 400)', async () => {
		// `Invalid cursor value` from the encode paths is a server fault
		// (corrupted watermark) and must propagate as-is, not map to 400.
		// The encode paths throw a plain `Error` (not `InvalidCursorError`),
		// so this is exactly what reaches the guard in that case.
		const encodeError = new Error('Invalid cursor value')
		await expect(
			guardCursorErrors(async () => {
				throw encodeError
			})
		).rejects.toBe(encodeError)
	})

	test('rethrows a real encode-side identity failure from encodeCursor unchanged', async () => {
		// End-to-end: the real `encodeCursor` with an invalid identity
		// (a space in the region) throws a plain `Error` (server fault,
		// e.g. a corrupted watermark), which the guard must rethrow as-is
		// — never map to a 400 BadRequestError.
		const promise = guardCursorErrors(() =>
			Promise.resolve(encodeCursor('B0ABCDEF01', 'us eu', null, 5, 1))
		)
		await expect(promise).rejects.toThrow('Invalid cursor')
		await expect(promise).rejects.not.toBeInstanceOf(BadRequestError)
	})

	test('resolves untouched values', async () => {
		await expect(guardCursorErrors(async () => 42)).resolves.toBe(42)
	})
})
