// Unit coverage for the shared history route ASIN guard: the `:asin`
// path parameter is normalized (trimmed) by `AsinSchema` and returned
// verbatim to the caller, while a malformed ASIN is a client-input 400.

import { describe, expect, test } from 'bun:test'

import { requireValidAsin } from '#config/routes/books/historyRouteGuards'
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
