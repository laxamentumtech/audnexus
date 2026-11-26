import type { AxiosResponse } from 'axios'
import { afterAll, beforeEach, describe, expect, type Mock,mock, test } from 'bun:test'

import BookSimilarHelper from '#helpers/books/audible/BookSimilarHelper'
import * as fetchPlus from '#helpers/utils/fetchPlus'

mock.module('#helpers/utils/fetchPlus', () => ({
	default: mock()
}))

const mockFetch = fetchPlus.default as Mock

const ASIN = 'B079LRSMNN'

const similarResponse = (products: unknown) => ({
	data: { similar_products: products },
	status: 200
})

const bulkResponse = (products: unknown[]) => ({
	data: { products },
	status: 200
})

const fullProduct = {
	asin: 'B010000001',
	title: 'Similar Book',
	authors: [{ asin: 'B020000001', name: 'Author One' }],
	narrators: [{ name: 'Narrator One' }],
	product_images: {
		500: 'https://m.media-amazon.com/images/I/AAA.jpg',
		1024: 'https://m.media-amazon.com/images/I/BBB.jpg'
	},
	rating: { overall_distribution: { display_average_rating: '4.2' } },
	release_date: '2020-05-01T00:00:00.000Z',
	runtime_length_min: 300,
	// `publication_name` is what the full parser's primary-series selection
	// matches against: without it the series array is never projected.
	publication_name: 'Series Name',
	series: [{ asin: 'B090000001', title: 'Series Name', sequence: '1' }]
}

beforeEach(() => {
	mockFetch.mockReset()
})

describe('BookSimilarHelper', () => {
	test('fetchSimilar requests RawSimilarities with a 50-result cap', async () => {
		mockFetch.mockResolvedValue(similarResponse([]) as AxiosResponse)
		const helper = new BookSimilarHelper(ASIN, 'us')
		await helper.fetchSimilar()
		const url = mockFetch.mock.calls[0][0] as string
		expect(url).toBe(
			`https://api.audible.com/1.0/catalog/products/${ASIN}/sims?similarity_type=RawSimilarities&num_results=50`
		)
	})

	test('fetchSimilar uses the region TLD', async () => {
		mockFetch.mockResolvedValue(similarResponse([]) as AxiosResponse)
		const helper = new BookSimilarHelper(ASIN, 'uk')
		await helper.fetchSimilar()
		expect(mockFetch.mock.calls[0][0]).toContain('https://api.audible.co.uk/')
	})

	test('fetchSimilar wraps upstream failures', async () => {
		mockFetch.mockRejectedValue({ status: 500 })
		const helper = new BookSimilarHelper(ASIN, 'us')
		await expect(helper.fetchSimilar()).rejects.toThrow(
			`An error occured while fetching data from Audible API. Response: 500, ASIN: ${ASIN}`
		)
	})

	test('getSimilarAsins extracts, deduplicates, and caps at 50', async () => {
		const products = [
			{ asin: 'B01AAAAAAA' },
			{ asin: 'B01BBBBBBB' },
			{ asin: 'B01AAAAAAA' },
			{ asin: 42 },
			{},
			null,
			...Array.from({ length: 60 }, (_, i) => ({
				asin: `B01${String(i).padStart(6, '0')}A`
			}))
		]
		mockFetch.mockResolvedValue(similarResponse(products) as AxiosResponse)
		const helper = new BookSimilarHelper(ASIN, 'us')
		const asins = await helper.getSimilarAsins()
		expect(asins).toHaveLength(50)
		expect(asins[0]).toBe('B01AAAAAAA')
		expect(asins[1]).toBe('B01BBBBBBB')
		expect(new Set(asins).size).toBe(asins.length)
	})

	test('getSimilarAsins returns an empty list for missing or empty data', async () => {
		mockFetch.mockResolvedValue(similarResponse([]) as AxiosResponse)
		expect(await new BookSimilarHelper(ASIN, 'us').getSimilarAsins()).toEqual([])

		mockFetch.mockResolvedValue({ data: {}, status: 200 } as AxiosResponse)
		expect(await new BookSimilarHelper(ASIN, 'us').getSimilarAsins()).toEqual([])
	})

	test('expand maps products to summaries', async () => {
		mockFetch.mockResolvedValue(bulkResponse([fullProduct]) as AxiosResponse)
		const helper = new BookSimilarHelper(ASIN, 'us')
		const [summary] = await helper.expand(['B010000001'])
		expect(summary).toEqual({
			asin: 'B010000001',
			title: 'Similar Book',
			authors: [{ asin: 'B020000001', name: 'Author One' }],
			narrators: [{ name: 'Narrator One' }],
			image: 'https://m.media-amazon.com/images/I/AAA.jpg',
			rating: '4.2',
			releaseDate: '2020-05-01T00:00:00.000Z',
			runtimeLengthMin: 300,
			seriesPrimary: { asin: 'B090000001', name: 'Series Name', position: '1' }
		})
		const url = mockFetch.mock.calls[0][0] as string
		expect(url).toContain('asins=B010000001')
		expect(url).toContain(
			'response_groups=contributors,media,product_attrs,product_desc,product_details,rating,series'
		)
		expect(url).toContain('image_sizes=500,1024')
	})

	test('expand falls back to the 1024 image when 500 is missing', async () => {
		mockFetch.mockResolvedValue(
			bulkResponse([{ ...fullProduct, product_images: { 1024: 'https://x/B.jpg' } }]) as AxiosResponse
		)
		const helper = new BookSimilarHelper(ASIN, 'us')
		const [summary] = await helper.expand(['B010000001'])
		expect(summary?.image).toBe('https://x/B.jpg')
	})

	test('expand omits optional fields that are missing', async () => {
		mockFetch.mockResolvedValue(
			bulkResponse([
				{
					asin: 'B010000001',
					title: 'Bare Book',
					authors: [],
					release_date: '2020-05-01T00:00:00.000Z'
				}
			]) as AxiosResponse
		)
		const helper = new BookSimilarHelper(ASIN, 'us')
		const [summary] = await helper.expand(['B010000001'])
		expect(summary).toEqual({
			asin: 'B010000001',
			title: 'Bare Book',
			authors: [],
			narrators: [],
			releaseDate: '2020-05-01T00:00:00.000Z'
		})
	})

	test('expand omits invalid entries and keeps valid ones', async () => {
		mockFetch.mockResolvedValue(
			bulkResponse([
				fullProduct,
				{ asin: 'B010000001' }, // no title
				{ title: 'No asin' },
				{
					asin: 'B01INVALID9',
					title: 'No release date',
					authors: []
				},
				null
			]) as AxiosResponse
		)
		const helper = new BookSimilarHelper(ASIN, 'us')
		const summaries = await helper.expand(['B010000001'])
		expect(summaries).toHaveLength(1)
		expect(summaries[0].asin).toBe('B010000001')
	})

	test('expand throws on bulk fetch failure', async () => {
		mockFetch.mockRejectedValue({ status: 503 })
		const helper = new BookSimilarHelper(ASIN, 'us')
		await expect(helper.expand(['B010000001'])).rejects.toThrow(/503/)
	})

	test('expand keeps only the requested audiobook from a mixed bulk response', async () => {
		// One bulk response carrying (1) the requested audiobook, (2) a
		// requested podcast with a COMPLETE summary shape, and (3) an
		// unsolicited audiobook with a valid ASIN: only the requested
		// audiobook survives. The podcast is rejected by the content-type
		// gate (a complete shape is not enough) and the unsolicited product
		// is rejected by the requested-set gate (a valid ASIN is not enough).
		const requestedAudiobook = {
			asin: 'B010000001',
			title: 'Requested Audiobook',
			content_delivery_type: 'MultiPartBook',
			authors: [],
			release_date: '2020-05-01T00:00:00.000Z'
		}
		const requestedPodcast = {
			asin: 'B010000002',
			title: 'Requested Podcast',
			content_delivery_type: 'Podcast',
			authors: [{ asin: 'B020000001', name: 'Author One' }],
			narrators: [{ name: 'Narrator One' }],
			product_images: {
				500: 'https://m.media-amazon.com/images/I/AAA.jpg',
				1024: 'https://m.media-amazon.com/images/I/BBB.jpg'
			},
			rating: { overall_distribution: { display_average_rating: '4.2' } },
			release_date: '2020-05-01T00:00:00.000Z',
			runtime_length_min: 300,
			publication_name: 'Series Name',
			series: [{ asin: 'B090000001', title: 'Series Name', sequence: '1' }]
		}
		const unsolicitedAudiobook = {
			asin: 'B010000003',
			title: 'Unsolicited Audiobook',
			content_delivery_type: 'MultiPartBook',
			authors: [],
			release_date: '2020-05-01T00:00:00.000Z'
		}
		mockFetch.mockResolvedValue(
			bulkResponse([requestedAudiobook, requestedPodcast, unsolicitedAudiobook]) as AxiosResponse
		)
		const helper = new BookSimilarHelper(ASIN, 'us')
		const summaries = await helper.expand(['B010000001', 'B010000002'])
		// The requested podcast (complete shape) and the unsolicited
		// audiobook (valid ASIN) are both dropped; only the requested
		// audiobook is returned.
		expect(summaries).toHaveLength(1)
		expect(summaries[0].asin).toBe('B010000001')
		expect(summaries[0].title).toBe('Requested Audiobook')
	})

	test('expand selects the publication_name-matching series and falls back to the issue date', async () => {
		// The primary series is the one whose name matches `publication_name`,
		// NOT the first entry; and a non-empty `release_date` wins over the
		// issue date, while an empty `release_date` falls back to a valid
		// `issue_date`.
		const product = {
			asin: 'B010000001',
			title: 'Series Book',
			authors: [],
			release_date: '',
			issue_date: '2021-06-15T00:00:00.000Z',
			publication_name: 'Matching Series',
			series: [
				{ asin: 'B090000001', title: 'First Series', sequence: '1' },
				{ asin: 'B090000002', title: 'Matching Series', sequence: '3' }
			]
		}
		mockFetch.mockResolvedValue(bulkResponse([product]) as AxiosResponse)
		const helper = new BookSimilarHelper(ASIN, 'us')
		const [summary] = await helper.expand(['B010000001'])
		// The matching series (not the first entry) is projected...
		expect(summary?.seriesPrimary).toEqual({ asin: 'B090000002', name: 'Matching Series', position: '3' })
		// ...and the empty release_date falls back to the issue date.
		expect(summary?.releaseDate).toBe('2021-06-15T00:00:00.000Z')
	})
})

afterAll(() => {
	mock.restore()
})
