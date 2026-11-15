import { describe, expect, test } from 'bun:test'

import { mapAudibleTags, parseGoodreadsRating, TAG_TYPE_MAP } from '#helpers/books/audible/metadataMapping'

describe('mapAudibleTags', () => {
	const entry = (over: Record<string, unknown> = {}) => ({
		id: 'adbl_rec_tag_0-2-172',
		display_text: 'Witty',
		type: 'mood',
		...over
	})

	test('maps all known namespaces to public types', () => {
		const raw = [
			entry({ id: 'a', display_text: 'M', type: 'mood' }),
			entry({ id: 'b', display_text: 'T', type: 'theme' }),
			entry({ id: 'c', display_text: 'PA', type: 'world_tree-publisher_assigned' }),
			entry({ id: 'd', display_text: 'MA', type: 'world_tree-model_assigned' }),
			entry({ id: 'e', display_text: 'CE', type: 'coverage_expansion' }),
			entry({ id: 'f', display_text: 'AE', type: 'audible_editors' }),
			entry({ id: 'g', display_text: 'GR', type: 'goodreads' }),
			entry({ id: 'h', display_text: 'AW', type: 'awards' }),
			entry({ id: 'i', display_text: 'SM', type: 'social_media' }),
			entry({ id: 'j', display_text: 'FR', type: 'franchise' }),
			entry({ id: 'k', display_text: 'DU', type: 'duration' }),
			entry({ id: 'l', display_text: 'IR', type: 'instareads' })
		]
		expect(mapAudibleTags(raw)).toEqual([
			{ tagId: 'a', name: 'M', type: 'mood' },
			{ tagId: 'b', name: 'T', type: 'theme' },
			{ tagId: 'c', name: 'PA', type: 'topic' },
			{ tagId: 'd', name: 'MA', type: 'topic' },
			{ tagId: 'e', name: 'CE', type: 'topic' },
			{ tagId: 'f', name: 'AE', type: 'editorial' },
			{ tagId: 'g', name: 'GR', type: 'goodreads' },
			{ tagId: 'h', name: 'AW', type: 'award' },
			{ tagId: 'i', name: 'SM', type: 'social' },
			{ tagId: 'j', name: 'FR', type: 'franchise' },
			{ tagId: 'k', name: 'DU', type: 'duration' },
			{ tagId: 'l', name: 'IR', type: 'instareads' }
		])
	})

	test('maps unknown types to other', () => {
		expect(mapAudibleTags([entry({ type: 'brand_new_namespace' })])).toEqual([
			{ tagId: 'adbl_rec_tag_0-2-172', name: 'Witty', type: 'other' }
		])
	})

	test('maps inherited Object.prototype names to other', () => {
		// A tag type named `constructor` (or `toString`) is an inherited
		// key of TAG_TYPE_MAP, not an own entry: it must not surface the
		// inherited function/value, which ApiTagSchema would reject.
		expect(mapAudibleTags([entry({ type: 'constructor' })])).toEqual([
			{ tagId: 'adbl_rec_tag_0-2-172', name: 'Witty', type: 'other' }
		])
		expect(mapAudibleTags([entry({ type: 'toString' })])).toEqual([
			{ tagId: 'adbl_rec_tag_0-2-172', name: 'Witty', type: 'other' }
		])
	})

	test('deduplicates by tagId keeping first occurrence and upstream order', () => {
		expect(
			mapAudibleTags([
				entry({ id: 'x', display_text: 'Second' }),
				entry({ id: 'y', display_text: 'First' }),
				entry({ id: 'x', display_text: 'Duplicate' })
			])
		).toEqual([
			{ tagId: 'x', name: 'Second', type: 'mood' },
			{ tagId: 'y', name: 'First', type: 'mood' }
		])
	})

	test('empty array is explicit empty', () => {
		expect(mapAudibleTags([])).toEqual([])
	})

	test('non-array is undefined', () => {
		expect(mapAudibleTags(undefined)).toBeUndefined()
		expect(mapAudibleTags(null)).toBeUndefined()
		expect(mapAudibleTags('nope')).toBeUndefined()
		expect(mapAudibleTags({})).toBeUndefined()
	})

	test('nonempty all-invalid array is undefined', () => {
		expect(
			mapAudibleTags([
				{ display_text: 'No id' },
				{ id: '', display_text: 'Empty id' },
				{ id: 'a' },
				{ id: 'b', display_text: '' },
				{ id: 'c', display_text: null },
				{ id: 42, display_text: 'x' },
				'garbage',
				null,
				{ id: 'd', display_text: 'y', type: 7 }
			])
		).toBeUndefined()
	})

	test('partial validity keeps only valid entries', () => {
		expect(
			mapAudibleTags([
				{ display_text: 'Bad' },
				entry(),
				'garbage',
				entry({ id: 'second', display_text: 'Keep' })
			])
		).toEqual([
			{ tagId: 'adbl_rec_tag_0-2-172', name: 'Witty', type: 'mood' },
			{ tagId: 'second', name: 'Keep', type: 'mood' }
		])
	})

	test('extra fields on entries are ignored', () => {
		expect(
			mapAudibleTags([entry({ rank: 1, source: 'recommendation', extra: true })])
		).toEqual([{ tagId: 'adbl_rec_tag_0-2-172', name: 'Witty', type: 'mood' }])
	})
})

describe('parseGoodreadsRating', () => {
	test('maps rating_num and string count with commas', () => {
		expect(parseGoodreadsRating({ rating_num: 4.6, count: '4,210' })).toEqual({
			value: 4.6,
			numRatings: 4210
		})
	})

	test('accepts numeric count', () => {
		expect(parseGoodreadsRating({ rating_num: 4.6, count: 123 })).toEqual({
			value: 4.6,
			numRatings: 123
		})
	})

	test('rounds value to one decimal', () => {
		expect(parseGoodreadsRating({ rating_num: 4.567, count: '10' })?.value).toBe(4.6)
		expect(parseGoodreadsRating({ rating_num: 4.549, count: '10' })?.value).toBe(4.5)
	})

	test('strips all non-digits from count', () => {
		expect(parseGoodreadsRating({ rating_num: 4.0, count: '1 2 3' })?.numRatings).toBe(123)
	})

	test('empty or non-numeric count is undefined', () => {
		expect(parseGoodreadsRating({ rating_num: 4.0, count: 'no digits' })).toBeUndefined()
		expect(parseGoodreadsRating({ rating_num: 4.0, count: '' })).toBeUndefined()
	})

	test('missing rating_num or non-number is undefined', () => {
		expect(parseGoodreadsRating({ count: '10' })).toBeUndefined()
		expect(parseGoodreadsRating({ rating_num: '4.6', count: '10' })).toBeUndefined()
		expect(parseGoodreadsRating({ rating_num: NaN, count: '10' })).toBeUndefined()
		expect(parseGoodreadsRating({ rating_num: Infinity, count: '10' })).toBeUndefined()
	})

	test('non-object raw is undefined', () => {
		expect(parseGoodreadsRating(undefined)).toBeUndefined()
		expect(parseGoodreadsRating(null)).toBeUndefined()
		expect(parseGoodreadsRating(4.2)).toBeUndefined()
		expect(parseGoodreadsRating('4.6')).toBeUndefined()
	})
})

describe('TAG_TYPE_MAP', () => {
	test('exposes every documented upstream namespace', () => {
		expect(TAG_TYPE_MAP).toEqual({
			mood: 'mood',
			theme: 'theme',
			'world_tree-publisher_assigned': 'topic',
			'world_tree-model_assigned': 'topic',
			coverage_expansion: 'topic',
			audible_editors: 'editorial',
			goodreads: 'goodreads',
			awards: 'award',
			social_media: 'social',
			franchise: 'franchise',
			duration: 'duration',
			instareads: 'instareads'
		})
	})
})
