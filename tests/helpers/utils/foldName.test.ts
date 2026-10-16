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
	test('folds composed and decomposed Unicode forms identically', () => {
		// U+00E9 (composed é) vs e + U+0301 (decomposed): NFKC merges them
		expect(foldName('Rene\u0301e')).toBe(foldName('Ren\u00e9e'))
		expect(foldName('J\u00e9an')).toBe(foldName('Je\u0301an'))
	})
	test('folds full-width Latin to its ASCII form', () => {
		expect(foldName('\uFF2A\uFF21\uFF2E\uFF25')).toBe('jane')
	})
	test('folds multi-character NFKC compatibility expansions (ligatures)', () => {
		// U+FB01 (ﬁ) is a compatibility ligature that NFKC expands to 'fi'
		expect(foldName('A\uFB01n')).toBe(foldName('Afin'))
		expect(foldName('A\uFB01n')).toBe('afin')
	})
	test('keeps non-Latin script spellings distinct', () => {
		// No casing to fold; whitespace-only normalization does not merge
		// differently-spaced spellings of the same name
		expect(foldName('村上 春樹')).toBe('村上 春樹')
		expect(foldName('村上春樹')).toBe('村上春樹')
		expect(foldName('村上 春樹')).not.toBe(foldName('村上春樹'))
	})
})
