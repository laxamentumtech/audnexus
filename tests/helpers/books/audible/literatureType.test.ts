import { describe, expect, test } from 'bun:test'

import type { AudibleProduct } from '#config/types'
import literatureTypeFromProduct from '#helpers/books/audible/literatureType'

type Ladders = AudibleProduct['product']['category_ladders']

const cat = (ladder: string[], root = 'Genres'): Ladders[number] => ({
	root,
	ladder: ladder.map((name, i) => ({ id: String(18570000000 + i), name }))
})

describe('literatureTypeFromProduct', () => {
	test('fiction root, no fiction keyword', () => {
		const ladders: Ladders = [
			cat(['Mystery, Thriller & Suspense', 'Thriller & Suspense', 'Espionage'])
		]
		expect(literatureTypeFromProduct(ladders, [], 'us')).toBe('fiction')
	})

	test('Science Fiction & Fantasy root, no keyword', () => {
		const ladders: Ladders = [cat(['Science Fiction & Fantasy', 'Science Fiction', 'Space Opera'])]
		expect(literatureTypeFromProduct(ladders, undefined, 'us')).toBe('fiction')
	})

	test('children nonfiction stays nonfiction', () => {
		const ladders: Ladders = [cat(["Children's Audiobooks", 'Biographies'])]
		expect(literatureTypeFromProduct(ladders, [], 'us')).toBe('nonfiction')
	})

	test('children fiction via 2nd level', () => {
		const ladders: Ladders = [cat(["Children's Audiobooks", 'Literature & Fiction', 'Family Life'])]
		expect(literatureTypeFromProduct(ladders, [], 'us')).toBe('fiction')
	})

	test('teen fiction via 2nd level', () => {
		const ladders: Ladders = [cat(['Teen & Young Adult', 'Romance'])]
		expect(literatureTypeFromProduct(ladders, [], 'us')).toBe('fiction')
	})

	test('comedy biography (2nd-level nonfiction) stays nonfiction', () => {
		const ladders: Ladders = [cat(['Comedy & Humor', 'Biographies & Memoirs'])]
		expect(literatureTypeFromProduct(ladders, [], 'us')).toBe('nonfiction')
	})

	test('keyword fallback when no ladders', () => {
		const ladders: Ladders = []
		expect(literatureTypeFromProduct(ladders, ['literature-and-fiction'], 'us')).toBe('fiction')
	})

	test('no signal, ladders present, nonfiction', () => {
		const ladders: Ladders = [cat(['Biographies & Memoirs', 'Historical'])]
		expect(literatureTypeFromProduct(ladders, ['test'], 'us')).toBe('nonfiction')
	})

	test('German region localization', () => {
		const ladders: Ladders = [cat(['Literatur & Belletristik', 'Belletristik'])]
		expect(literatureTypeFromProduct(ladders, [], 'de')).toBe('fiction')
	})

	test('Japanese region localization', () => {
		const ladders: Ladders = [cat(['SF・ファンタジー', 'SF'])]
		expect(literatureTypeFromProduct(ladders, [], 'jp')).toBe('fiction')
	})
})
