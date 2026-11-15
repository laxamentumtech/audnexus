// Real Fastify injection against the /books/:asin/similar route: the
// common ASIN/region validation, the default ASIN-only response, the
// `expand=books` summary expansion (with the empty-list short-circuit),
// and upstream failure propagation. The upstream boundary is mocked at
// the helper's fetch dependency.

import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { fastify, type FastifyInstance } from 'fastify'

import { registerApiErrorHandler } from '#config/errorHandler'
import similarBook from '#config/routes/books/similar'

const mockSimilarFetch = mock()

mock.module('#helpers/utils/fetchPlus', () => ({
	default: mockSimilarFetch
}))

const ASIN = 'B00TEST123'
const SIMILAR_URL = `${ASIN}/sims?similarity_type=RawSimilarities&num_results=50`

const similarResponse = (asins: string[]) => ({
	data: {
		similar_products: asins.map((a) => ({ asin: a }))
	},
	status: 200
})

const bulkResponse = (asins: string[]) => ({
	data: {
		products: asins.map((a) => ({
			asin: a,
			title: `Book ${a}`,
			authors: [{ name: 'Author' }],
			narrators: [],
			release_date: '2020-05-01T00:00:00.000Z',
			runtime_length_min: 100
		}))
	},
	status: 200
})

let app: FastifyInstance

beforeEach(async () => {
	mockSimilarFetch.mockReset()
	app = fastify({ logger: false, disableRequestLogging: true })
	registerApiErrorHandler(app)
	await app.register(similarBook)
	await app.ready()
})

afterEach(async () => {
	await app.close()
})

afterAll(() => {
	mock.restore()
})

describe('GET /books/:asin/similar', () => {
	test('returns deduplicated similar ASINs by default', async () => {
		mockSimilarFetch.mockResolvedValue(similarResponse(['B01AAAAA11', 'B01BBBBB22']))
		const response = await app.inject({ method: 'GET', url: `/books/${ASIN}/similar` })
		expect(response.statusCode).toBe(200)
		const body = response.json()
		expect(body.asin).toBe(ASIN)
		expect(body.region).toBe('us')
		expect(body.similarAsins).toEqual(['B01AAAAA11', 'B01BBBBB22'])
		expect(body.expanded).toBe(false)
		expect(body).not.toHaveProperty('books')
		expect(mockSimilarFetch).toHaveBeenCalledTimes(1)
		expect(mockSimilarFetch.mock.calls[0][0]).toContain(SIMILAR_URL)
	})

	test('honors the region query parameter', async () => {
		mockSimilarFetch.mockResolvedValue(similarResponse(['B01AAAAA11']))
		const response = await app.inject({
			method: 'GET',
			url: `/books/${ASIN}/similar?region=uk`
		})
		expect(response.statusCode).toBe(200)
		expect(response.json().region).toBe('uk')
		expect(mockSimilarFetch.mock.calls[0][0]).toContain('api.audible.co.uk')
	})

	test('expand=books returns summaries', async () => {
		mockSimilarFetch
			.mockResolvedValueOnce(similarResponse(['B01AAAAA11', 'B01BBBBB22']))
			.mockResolvedValueOnce(bulkResponse(['B01AAAAA11', 'B01BBBBB22']))
		const response = await app.inject({
			method: 'GET',
			url: `/books/${ASIN}/similar?expand=books`
		})
		expect(response.statusCode).toBe(200)
		const body = response.json()
		expect(body.expanded).toBe(true)
		expect(body.books).toHaveLength(2)
		expect(body.books[0]).toEqual({
			asin: 'B01AAAAA11',
			title: 'Book B01AAAAA11',
			authors: [{ name: 'Author' }],
			narrators: [],
			releaseDate: '2020-05-01T00:00:00.000Z',
			runtimeLengthMin: 100
		})
		expect(mockSimilarFetch).toHaveBeenCalledTimes(2)
		expect(mockSimilarFetch.mock.calls[1][0]).toContain('asins=B01AAAAA11,B01BBBBB22')
	})

	test('expand=books with an empty similar list returns books: [] without the bulk fetch', async () => {
		mockSimilarFetch.mockResolvedValue(similarResponse([]))
		const response = await app.inject({
			method: 'GET',
			url: `/books/${ASIN}/similar?expand=books`
		})
		expect(response.statusCode).toBe(200)
		const body = response.json()
		expect(body.similarAsins).toEqual([])
		expect(body.expanded).toBe(true)
		expect(body.books).toEqual([])
		expect(mockSimilarFetch).toHaveBeenCalledTimes(1)
	})

	test('upstream failures are not masked', async () => {
		mockSimilarFetch.mockRejectedValue({ status: 500 })
		const response = await app.inject({ method: 'GET', url: `/books/${ASIN}/similar` })
		expect(response.statusCode).toBe(500)
	})

	test('invalid expand values are rejected with a 400', async () => {
		const response = await app.inject({
			method: 'GET',
			url: `/books/${ASIN}/similar?expand=chapters`
		})
		expect(response.statusCode).toBe(400)
	})

	test('padded ASINs are trimmed before the upstream fetch', async () => {
		mockSimilarFetch.mockResolvedValue(similarResponse([]))
		const response = await app.inject({
			method: 'GET',
			url: `/books/%20${ASIN}%20/similar`
		})
		expect(response.statusCode).toBe(200)
		expect(response.json().asin).toBe(ASIN)
		expect(mockSimilarFetch.mock.calls[0][0]).toContain(`products/${ASIN}/sims`)
		expect(mockSimilarFetch.mock.calls[0][0]).not.toContain(`products/${ASIN} /sims`)
	})
})
