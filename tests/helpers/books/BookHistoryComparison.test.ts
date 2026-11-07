import { describe, expect, test } from 'bun:test'

import type {
	BookObservation,
	FieldBaseline,
	HistoryBaselines,
	HistoryValue,
	RenditionBaseline
} from '#config/bookHistory'
import {
	ARTWORK_POLICY,
	EDITORIAL_FIELD_POLICIES,
	RELEASE_DATE_ISSUE_POLICY,
	RELEASE_DATE_RELEASE_POLICY
} from '#config/bookHistory'
import {
	compareBookObservation,
	type ComparisonResult,
	hasChanges,
	jsonDeepEqual} from '#helpers/books/BookHistoryComparison'

const now = new Date('2026-10-01T12:00:00.000Z')
const earlier = new Date('2026-09-01T12:00:00.000Z')

const asValue = (value: HistoryValue['value'] & object): HistoryValue => ({
	state: 'value',
	value
})

function observation(
	fields: Array<{ field: string; policy?: string; value: HistoryValue }>,
	artwork: Array<{ rendition: string; sourceUrl: string; imageId: string | null }> = []
): BookObservation {
	return {
		observedAt: now,
		apiReceivedAt: now,
		responseGroups: ['product'],
		requestedRenditions: artwork.map((a) => a.rendition),
		fields: fields.map((f) => ({
			field: f.field as never,
			policy:
				f.policy ??
				EDITORIAL_FIELD_POLICIES[f.field as keyof typeof EDITORIAL_FIELD_POLICIES],
			value: f.value,
			source: 'audible_api'
		})),
		artwork: artwork.map((a) => ({ rendition: a.rendition, sourceUrl: a.sourceUrl, imageId: a.imageId }))
	}
}

function baselines(
	fields: FieldBaseline[] = [],
	renditions: RenditionBaseline[] = []
): HistoryBaselines {
	return { fields, renditions }
}

function fieldBaseline(
	field: (typeof EDITORIAL_FIELD_POLICIES)[keyof typeof EDITORIAL_FIELD_POLICIES],
	value: HistoryValue,
	at: Date = earlier
): FieldBaseline {
	return { field, policy: EDITORIAL_FIELD_POLICIES[field], value, baselineAt: at }
}

function renditionBaseline(
	rendition: string,
	imageId: string,
	sourceUrl = `https://m.media-amazon.com/images/I/${imageId}.jpg`
): RenditionBaseline {
	return {
		rendition,
		policy: ARTWORK_POLICY,
		imageId,
		sourceUrl,
		baselineAt: earlier
	}
}

describe('jsonDeepEqual', () => {
	test('object equality is order-insensitive, array equality is order-sensitive', () => {
		expect(jsonDeepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
		expect(jsonDeepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false)
		expect(jsonDeepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
		expect(jsonDeepEqual([1, 2], [2, 1])).toBe(false)
		expect(jsonDeepEqual([1, 2], [1, 2])).toBe(true)
		expect(jsonDeepEqual(null, { a: 1 })).toBe(false)
		expect(jsonDeepEqual('x', { a: 'x' })).toBe(false)
	})
})

describe('field comparison', () => {
	test('equal values retain the old baseline and timestamp', () => {
		const previous = baselines([fieldBaseline('title', asValue('Same Title'))])
		const result = compareBookObservation(
			previous,
			observation([{ field: 'title', value: asValue('Same Title') }])
		)
		expect(result.changedFields).toEqual([])
		expect(result.fields[0].baselineAt).toBe(earlier)
	})

	test('same-policy inequality records the delta and advances the baseline', () => {
		const previous = baselines([fieldBaseline('title', asValue('Old Title'))])
		const result = compareBookObservation(
			previous,
			observation([{ field: 'title', value: asValue('New Title') }])
		)
		expect(result.changedFields).toEqual(['title'])
		expect(result.changes['title']).toEqual({
			before: asValue('Old Title'),
			after: asValue('New Title')
		})
		expect(result.policies.fields.title).toBe('editorial:title:v1')
		expect(result.fields[0].baselineAt).toBe(now)
	})

	test('unknown incoming evidence retains the old baseline without changes', () => {
		const previous = baselines([fieldBaseline('title', asValue('Kept')), fieldBaseline('isbn', asValue('1'))])
		const result = compareBookObservation(previous, observation([]))
		expect(result.changedFields).toEqual([])
		expect(result.fields.map((f) => f.field).sort()).toEqual(['isbn', 'title'])
	})

	test('a field absent from both sides stays absent', () => {
		const result = compareBookObservation(baselines(), observation([]))
		expect(result.fields).toEqual([])
		expect(hasChanges(result)).toBe(false)
	})

	test('policy change replaces the baseline silently, no delta', () => {
		const previous = baselines([
			{
				field: 'releaseDate',
				policy: RELEASE_DATE_RELEASE_POLICY,
				value: asValue('2026-01-15T00:00:00.000Z'),
				baselineAt: earlier
			}
		])
		const result = compareBookObservation(
			previous,
			observation([
				{
					field: 'releaseDate',
					policy: RELEASE_DATE_ISSUE_POLICY,
					value: asValue('2025-11-05T00:00:00.000Z')
				}
			])
		)
		expect(result.changedFields).toEqual([])
		expect(result.fields[0].policy).toBe(RELEASE_DATE_ISSUE_POLICY)
		expect(result.fields[0].baselineAt).toBe(now)
	})

	test('missing baseline initializes silently', () => {
		const result = compareBookObservation(baselines(), observation([{ field: 'title', value: asValue('T') }]))
		expect(result.changedFields).toEqual([])
		expect(result.fields[0]).toEqual({
			field: 'title',
			policy: 'editorial:title:v1',
			value: asValue('T'),
			baselineAt: now
		})
	})

	test('a newly absent value is a change from a prior value', () => {
		const previous = baselines([fieldBaseline('subtitle', asValue('Sub'))])
		const result = compareBookObservation(
			previous,
			observation([{ field: 'subtitle', value: { state: 'absent' } }])
		)
		expect(result.changedFields).toEqual(['subtitle'])
		expect(result.changes['subtitle']).toEqual({
			before: asValue('Sub'),
			after: { state: 'absent' }
		})
	})
})

describe('artwork comparison', () => {
	test('same ID with a moved URL updates the reference without a revision', () => {
		const previous = baselines(
			[],
			[renditionBaseline('default', 'AAA', 'https://m.media-amazon.com/images/I/AAA._V1_.jpg')]
		)
		const result = compareBookObservation(
			previous,
			observation(
				[],
				[{ rendition: 'default', sourceUrl: 'https://m.media-amazon.com/images/I/AAA.jpg', imageId: 'AAA' }]
			)
		)
		expect(hasChanges(result)).toBe(false)
		expect(result.renditions[0].baselineAt).toBe(earlier)
		expect(result.renditions[0].sourceUrl).toBe('https://m.media-amazon.com/images/I/AAA.jpg')
	})

	test('different IDs in the same rendition is a transition with a delta', () => {
		const previous = baselines([], [renditionBaseline('default', 'AAA')])
		const result = compareBookObservation(
			previous,
			observation(
				[],
				[{ rendition: 'default', sourceUrl: 'https://m.media-amazon.com/images/I/BBB.jpg', imageId: 'BBB' }]
			)
		)
		expect(result.changedFields).toEqual(['artwork'])
		expect(result.changes['artwork']).toEqual([
			{
				rendition: 'default',
				before: { imageId: 'AAA', sourceUrl: 'https://m.media-amazon.com/images/I/AAA.jpg' },
				after: { imageId: 'BBB', sourceUrl: 'https://m.media-amazon.com/images/I/BBB.jpg' }
			}
		])
		expect(result.policies.artwork.default).toBe(ARTWORK_POLICY)
		expect(result.renditions[0].baselineAt).toBe(now)
	})

	test('multiple rendition transitions are all recorded', () => {
		const previous = baselines([], [
			renditionBaseline('default', 'AAA'),
			renditionBaseline('large', 'CCC')
		])
		const result = compareBookObservation(
			previous,
			observation(
				[],
				[
					{ rendition: 'default', sourceUrl: 'https://m.media-amazon.com/images/I/BBB.jpg', imageId: 'BBB' },
					{ rendition: 'large', sourceUrl: 'https://m.media-amazon.com/images/I/DDD.jpg', imageId: 'DDD' }
				]
			)
		)
		expect(result.changedFields).toEqual(['artwork'])
		expect(result.changes['artwork']).toEqual([
			{
				rendition: 'default',
				before: { imageId: 'AAA', sourceUrl: 'https://m.media-amazon.com/images/I/AAA.jpg' },
				after: { imageId: 'BBB', sourceUrl: 'https://m.media-amazon.com/images/I/BBB.jpg' }
			},
			{
				rendition: 'large',
				before: { imageId: 'CCC', sourceUrl: 'https://m.media-amazon.com/images/I/CCC.jpg' },
				after: { imageId: 'DDD', sourceUrl: 'https://m.media-amazon.com/images/I/DDD.jpg' }
			}
		])
	})

	test('new comparable renditions initialize baselines silently', () => {
		const result = compareBookObservation(
			baselines(),
			observation(
				[],
				[{ rendition: 'default', sourceUrl: 'https://m.media-amazon.com/images/I/AAA.jpg', imageId: 'AAA' }]
			)
		)
		expect(hasChanges(result)).toBe(false)
		expect(result.renditions[0].imageId).toBe('AAA')
	})

	test('unparsed references are not comparable renditions', () => {
		const previous = baselines([], [renditionBaseline('default', 'AAA')])
		const result = compareBookObservation(
			previous,
			observation(
				[],
				[
					{ rendition: 'default', sourceUrl: 'https://m.media-amazon.com/images/I/AAA.jpg', imageId: 'AAA' },
					{ rendition: 'weird', sourceUrl: 'https://example.com/x.png', imageId: null }
				]
			)
		)
		expect(hasChanges(result)).toBe(false)
		expect(result.renditions.map((r) => r.rendition)).toEqual(['default'])
	})

	test('renditions absent from the observation retain their baselines', () => {
		const previous = baselines([], [
			renditionBaseline('default', 'AAA'),
			renditionBaseline('large', 'CCC')
		])
		const result = compareBookObservation(previous, observation([]))
		expect(result.changedFields).toEqual([])
		expect(result.renditions.map((r) => r.rendition).sort()).toEqual(['default', 'large'])
	})
})

describe('hasChanges', () => {
	test('reports whether any tracked field or artwork transitioned', () => {
		const quiet: ComparisonResult = compareBookObservation(baselines(), observation([]))
		expect(hasChanges(quiet)).toBe(false)
		const loud: ComparisonResult = compareBookObservation(
			baselines([fieldBaseline('title', asValue('Old'))]),
			observation([{ field: 'title', value: asValue('New') }])
		)
		expect(hasChanges(loud)).toBe(true)
	})
})
