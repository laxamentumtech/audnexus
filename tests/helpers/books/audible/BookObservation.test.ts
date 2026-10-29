import { describe, expect, test } from 'bun:test'

import type { ApiBook } from '#config/types'
import {
	buildArtworkReferences,
	buildFieldObservations,
	canonicalGenres,
	composeObservation,
	composeTimestamps,
	isBookSeriesContentType,
	isLiteratureTypeJustified,
	type ObservationInputs,
	parseArtworkReference,
	type RawProduct,
	seriesEvidence,
	withGenresField} from '#helpers/books/audible/BookObservation'

const now = new Date('2026-10-01T12:00:00.000Z')

function makeBook(overrides: Partial<ApiBook> = {}): ApiBook {
	return {
		asin: 'B00TEST123',
		authors: [{ asin: 'AUTHOR1', name: 'Jane Doe' }],
		copyright: 2026,
		description: 'A description',
		formatType: 'MultiPartBook',
		image: 'https://m.media-amazon.com/images/I/AAA.jpg',
		isAdult: false,
		isbn: '9781234567890',
		language: 'en',
		literatureType: 'fiction',
		narrators: [{ asin: 'NAR1', name: 'The Narrator' }],
		publisherName: 'Publisher Co',
		rating: '4.5',
		region: 'us',
		releaseDate: new Date('2026-01-15T00:00:00.000Z'),
		runtimeLengthMin: 600,
		subtitle: 'A Subtitle',
		summary: 'A summary',
		title: 'A Title',
		...overrides
	}
}

function makeProduct(): RawProduct & {
	merchandising_summary: string
	publisher_summary: string
	issue_date?: string
} {
	return {
		asin: 'B00TEST123',
		authors: [{ asin: 'AUTHOR1', name: 'Jane Doe' }],
		copyright: 20260115,
		description: 'A description',
		formatType: 'MultiPartBook',
		image: 'https://m.media-amazon.com/images/I/AAA.jpg',
		isAdult: false,
		isbns: ['9781234567890'],
		language: 'en',
		literatureType: 'fiction',
		narrators: [{ asin: 'NAR1', name: 'The Narrator' }],
		publisherName: 'Publisher Co',
		rating: '4.5',
		region: 'us',
		isbn: '9781234567890',
		release_date: 'Jan 15, 2026',
		runtime_length_min: 600,
		subtitle: 'A Subtitle',
		merchandising_summary: 'A description',
		publisher_summary: 'A summary',
		title: 'A Title'
	} as unknown as RawProduct & {
		merchandising_summary: string
		publisher_summary: string
	}
}

function makeInputs(overrides: Partial<ObservationInputs> = {}): ObservationInputs {
	return {
		book: makeBook(),
		product: makeProduct(),
		copyrightYear: 2026,
		apiGenres: [
			{ asin: '1111111111', name: 'Genre B', type: 'Genre' },
			{ asin: '2222222222', name: 'Genre A', type: 'Genre' }
		],
		literatureTypeJustified: true,
		seriesKeyPresent: false,
		seriesOutcome: 'unavailable',
		...overrides
	}
}

describe('parseArtworkReference', () => {
	test('extracts the asset ID from the allowed hosts', () => {
		expect(parseArtworkReference('https://m.media-amazon.com/images/I/ABC123_DEF.jpg')).toBe(
			'ABC123_DEF'
		)
		expect(
			parseArtworkReference(
				'https://images-na.ssl-images-amazon.com/images/I/XYZ987._AC_SX100_.jpg'
			)
		).toBe('XYZ987')
	})

	test('recognizes plain image files and webp', () => {
		expect(parseArtworkReference('https://m.media-amazon.com/images/I/ID123.jpg')).toBe('ID123')
		expect(parseArtworkReference('https://m.media-amazon.com/images/I/ID123.webp')).toBe(
			'ID123'
		)
	})

	test('rejects non-http(s) protocols, credentials, and other hosts', () => {
		expect(parseArtworkReference('ftp://m.media-amazon.com/images/I/ABC.jpg')).toBeNull()
		expect(
			parseArtworkReference('https://user:m.media-amazon.com/images/I/ABC.jpg')
		).toBeNull()
		expect(parseArtworkReference('https://cdn.example.com/images/I/ABC.jpg')).toBeNull()
	})

	test('rejects non-recognized paths and unknown extensions', () => {
		expect(parseArtworkReference('https://m.media-amazon.com/images/G/ABC.jpg')).toBeNull()
		expect(parseArtworkReference('https://m.media-amazon.com/images/I/ABC.gif')).toBeNull()
		expect(parseArtworkReference('not a url')).toBeNull()
	})
})

describe('canonicalGenres', () => {
	test('deduplicates and sorts genre tuples', () => {
		const genres = [
			{ asin: '3333333333', name: 'Second', type: 'Genre' },
			{ asin: '1111111111', name: 'First', type: 'Genre' },
			{ asin: '3333333333', name: 'Second', type: 'Genre' }
		]
		expect(canonicalGenres(genres)).toEqual([
			['Genre', '1111111111', 'First'],
			['Genre', '3333333333', 'Second']
		])
	})

	test('returns an empty list for no genres', () => {
		expect(canonicalGenres([])).toEqual([])
	})
})

describe('buildFieldObservations', () => {
	test('builds mapped-value fields with evidence keys', () => {
		const fields = buildFieldObservations(makeInputs())
		const byField = new Map(fields.map((f) => [f.field, f.value]))
		expect(byField.get('title')).toEqual({ state: 'value', value: 'A Title' })
		expect(byField.get('subtitle')).toEqual({ state: 'value', value: 'A Subtitle' })
		expect(byField.get('authors')).toEqual({
			state: 'value',
			value: [{ asin: 'AUTHOR1', name: 'Jane Doe' }]
		})
		expect(byField.get('description')).toEqual({ state: 'value', value: 'A description' })
		expect(byField.get('summary')).toEqual({ state: 'value', value: 'A summary' })
		expect(byField.get('isbn')).toEqual({ state: 'value', value: '9781234567890' })
		expect(byField.get('copyright')).toEqual({ state: 'value', value: 2026 })
		expect(byField.get('isAdult')).toEqual({ state: 'value', value: false })
		expect(byField.get('literatureType')).toEqual({ state: 'value', value: 'fiction' })
	})

	test('omits observations for keys absent from the raw evidence', () => {
		const product = makeProduct()
		delete (product as Record<string, unknown>)['merchandising_summary']
		delete (product as Record<string, unknown>)['narrators']
		const fields = buildFieldObservations(makeInputs({ product }))
		const fieldsPresent = new Set(fields.map((f) => f.field))
		expect(fieldsPresent.has('description')).toBe(false)
		expect(fieldsPresent.has('narrators')).toBe(false)
	})

	test('selects the release-date policy from the upstream date present', () => {
		const releasePolicy = buildFieldObservations(makeInputs()).find(
			(f) => f.field === 'releaseDate'
		)?.policy
		expect(releasePolicy).toBe('releaseDate:release:v1')

		const product = makeProduct()
		delete (product as Record<string, unknown>)['release_date']
		;(product as Record<string, unknown>)['issue_date'] = 'Nov 5, 2025'
		const issuePolicy = buildFieldObservations(makeInputs({ product })).find(
			(f) => f.field === 'releaseDate'
		)?.policy
		expect(issuePolicy).toBe('releaseDate:issue:v1')

		const noDate = makeProduct()
		delete (noDate as Record<string, unknown>)['release_date']
		const noDateFields = buildFieldObservations(makeInputs({ product: noDate }))
		expect(noDateFields.find((f) => f.field === 'releaseDate')).toBeUndefined()
	})

	test('omits copyright when the mapper did not extract a year', () => {
		const fields = buildFieldObservations(makeInputs({ copyrightYear: undefined }))
		expect(fields.find((f) => f.field === 'copyright')).toBeUndefined()
	})

	test('series: explicit empty array is a known-absent envelope', () => {
		const product = makeProduct()
		const fields = buildFieldObservations(
			makeInputs({ product: product as RawProduct, seriesKeyPresent: true, seriesOutcome: 'absent' })
		)
		expect(fields.find((f) => f.field === 'seriesPrimary')?.value).toEqual({ state: 'absent' })
		expect(fields.find((f) => f.field === 'seriesSecondary')?.value).toEqual({ state: 'absent' })
	})

	test('series: key absent produces no series observations', () => {
		const fields = buildFieldObservations(makeInputs({ seriesKeyPresent: false }))
		expect(fields.find((f) => f.field === 'seriesPrimary')).toBeUndefined()
	})

	test('genres are canonicalized observations; literatureType needs justification', () => {
		const fields = buildFieldObservations(makeInputs())
		// Canonical order sorts by (type, asin, name), so asin '1111111111'
		// ('Genre B') precedes asin '2222222222' ('Genre A').
		expect(fields.find((f) => f.field === 'genres')?.value).toEqual({
			state: 'value',
			value: [
				['Genre', '1111111111', 'Genre B'],
				['Genre', '2222222222', 'Genre A']
			]
		})

		const unjustified = buildFieldObservations(makeInputs({ literatureTypeJustified: false }))
		expect(unjustified.find((f) => f.field === 'literatureType')).toBeUndefined()
	})
})

describe('artwork references', () => {
	test('builds one reference per product image, parsed or unparsed', () => {
		const refs = buildArtworkReferences({
			'default': 'https://m.media-amazon.com/images/I/AAA111.jpg',
			'large': 'https://example.com/cover.png'
		})
		expect(refs).toEqual([
			{
				rendition: 'default',
				sourceUrl: 'https://m.media-amazon.com/images/I/AAA111.jpg',
				imageId: 'AAA111'
			},
			{
				rendition: 'large',
				sourceUrl: 'https://example.com/cover.png',
				imageId: null
			}
		])
	})

	test('undefined and empty image maps produce no references', () => {
		expect(buildArtworkReferences(undefined)).toEqual([])
		expect(buildArtworkReferences({ 'default': '' })).toEqual([])
	})
})

describe('literature type and series helpers', () => {
	test('isLiteratureTypeJustified requires a non-empty classification input', () => {
		expect(isLiteratureTypeJustified(undefined, undefined)).toBe(false)
		expect(isLiteratureTypeJustified([], [])).toBe(false)
		expect(isLiteratureTypeJustified([{ ladder: [], root: 'r' }], undefined)).toBe(true)
		expect(isLiteratureTypeJustified(undefined, ['Fiction'])).toBe(true)
	})

	test('isBookSeriesContentType only accepts book-shaped content', () => {
		expect(isBookSeriesContentType('MultiPartBook')).toBe(true)
		expect(isBookSeriesContentType('SinglePartBook')).toBe(true)
		expect(isBookSeriesContentType('podcast')).toBe(false)
		expect(isBookSeriesContentType(undefined)).toBe(false)
	})

	test('seriesEvidence reflects content type, key, and selection', () => {
		expect(
			seriesEvidence(makeProduct() as RawProduct, 'MultiPartBook', true).present
		).toBeFalsy()
		expect(
			seriesEvidence(makeProduct() as RawProduct, 'podcast', true).present
		).toBeFalsy()
		const emptySeries = makeProduct()
		;(emptySeries as Record<string, unknown>)['series'] = []
		expect(seriesEvidence(emptySeries as RawProduct, 'MultiPartBook', true)).toEqual({
			present: true,
			outcome: 'absent'
		})
		const chosenSeries = makeProduct()
		;(chosenSeries as Record<string, unknown>)['series'] = [
			{ asin: 'SERIES1', title: 'Series One', sequence: '1' }
		]
		expect(seriesEvidence(chosenSeries as RawProduct, 'SinglePartBook', true)).toEqual({
			present: true,
			outcome: 'selected'
		})
		expect(seriesEvidence(chosenSeries as RawProduct, 'SinglePartBook', false)).toEqual({
			present: true,
			outcome: 'failed'
		})
	})
})

describe('composition helpers', () => {
	test('composeTimestamps picks the html receipt when present', () => {
		const html = new Date('2026-10-01T12:00:05.000Z')
		expect(composeTimestamps(now, html)).toEqual({
			observedAt: html,
			apiReceivedAt: now,
			htmlReceivedAt: html
		})
		expect(composeTimestamps(now)).toEqual({
			observedAt: now,
			apiReceivedAt: now,
			htmlReceivedAt: undefined
		})
	})

	test('withGenresField replaces by policy and drops empty genres', () => {
		const fields = [
			{ field: 'title' as const, policy: 'editorial:title:v1', value: { state: 'value' as const, value: 't' }, source: 'audible_api' as const }
		]
		const api = withGenresField(fields, [{ asin: '1111111111', name: 'G', type: 'L' }], 'audible_api')
		expect(api.find((f) => f.field === 'genres')?.policy).toBe('genres:api:v1')
		const html = withGenresField(fields, [{ asin: '1111111111', name: 'G', type: 'L' }], 'audible_html')
		expect(html.find((f) => f.field === 'genres')?.policy).toBe('genres:html:v1')
		expect(withGenresField(fields, [], 'audible_api')).toEqual(fields)
	})

	test('composeObservation assembles the envelope', () => {
		const obs = composeObservation(
			{
				observedAt: now,
				apiReceivedAt: now,
				responseGroups: ['product'],
				requestedRenditions: ['default']
			},
			[],
			[{ rendition: 'default', sourceUrl: 'https://m.media-amazon.com/images/I/A.jpg', imageId: 'A' }]
		)
		expect(obs.fields).toEqual([])
		expect(obs.artwork).toHaveLength(1)
	})
})
