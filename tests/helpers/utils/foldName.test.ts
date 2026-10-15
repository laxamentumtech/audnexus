import { describe, expect, test } from 'bun:test'

import { foldName } from '#helpers/utils/foldName'

describe('foldName', () => {
	test('trims leading and trailing whitespace', () => {
		expect(foldName('  Jane Doe ')).toBe('jane doe')
	})
	test('collapses internal whitespace runs', () => {
		expect(foldName('Jane   \t  Doe')).toBe('jane doe')
	})
	test('lowercases', () => {
		expect(foldName('JANE DOE')).toBe('jane doe')
	})
	test('folds all variants together', () => {
		expect(foldName('  JANE   Doe \n')).toBe(foldName('jane doe'))
	})
	test('keeps non-Latin script spellings distinct', () => {
		// No casing to fold; whitespace-only normalization does not merge
		// differently-spaced spellings of the same name
		expect(foldName('村上 春樹')).toBe('村上 春樹')
		expect(foldName('村上春樹')).toBe('村上春樹')
		expect(foldName('村上 春樹')).not.toBe(foldName('村上春樹'))
	})
})
