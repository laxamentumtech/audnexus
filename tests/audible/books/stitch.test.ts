import type { AxiosResponse } from 'axios'
import { afterAll, beforeAll, describe, expect, it, mock, spyOn } from 'bun:test'

import { ApiBook, AudibleProduct } from '#config/types'

mock.module('#helpers/utils/fetchPlus', () => {
	return { default: mock() }
})

import ChapterHelper from '#helpers/books/audible/ChapterHelper'
import StitchHelper from '#helpers/books/audible/StitchHelper'
import { NotFoundError } from '#helpers/errors/ApiErrors'
import * as fetchPlus from '#helpers/utils/fetchPlus'
import {
	B08C6YJ1LS,
	B017V4IM1G,
	B0036I54I6,
	minimalB0036I54I6
} from '#tests/datasets/audible/books/api'
import { combinedB08C6YJ1LS, combinedB017V4IM1G } from '#tests/datasets/audible/books/stitch'

// Set up environment variables for ChapterHelper
process.env.ADP_TOKEN = 'mock_adp_token'
// FAKE/MOCK RSA private key for testing only - NOT a real credential
process.env.PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIICXQIBAAKBgQDWGw8THIbueiDYRczKw15iLGhwkOJ5mvO3b12lZJYNyAqmVKqo
I3So1xJZveKLFkdjK9tIJ9Y2jfsNSpPR0oZTTaGGVs6JejN6sPP8dq+RsNheL+No
Poi5ae5OtXst+09exHAK+Td5lD+jSPbpgH0z6H2Ymxkzcj/0nfncdotQJwIDAQAB
AoGAY7/ljQzcXFyv0rLqT4kn/usbmV4W9XrYkxyib3zmX/NT6txFSeKC5mqVFRRf
aFdv2OdE2WAd7/rD/RRCvB2uEGUX1Nbyhw0Fd04tfdOUW5xYvD4Ij62eQzM+/axB
fxRrudMK1ZLnHY6y1SVFdISgcOXBjzSnVp62VVtzPoHXLBkCQQD1L2JgKu0NLuNz
VJZa+3uCkzaozvQLPWlPJ181RKXvPtAMmqAFT/BRXp6IRt/jDVLYYeNI9cnCjOsA
4ztMMxNzAkEA34y6VseUezMwOZVFP9A7O9dufIz/mPA8KYx6+y1BaNS7opcs6R3J
nwlmJQj/XDchHAboL+I0jdxFdGcCyK+rfQJBAK5eVIgv/wYxInES5xstXlkueOD0
zXpw4kP4rC0l9RyAf1V3YfZlM3Oq5vPj87V19EUO2KU6p5JExZyL/c/jQyECQHTm
Y38DyPqP7xT9oQPYwVDuvCE3nmV8owlbI+h7ZuwJ6sEAawTQheG7iYWuadLwJUlB
t2Nq1+6jFFLll0gYzQUCQQDdosNVYv5LB4hPYbV4yQK90WIQmiFL3GBm0afQVcxy
wJhvGwWnOXbc/RAmdfeZH4H2XJCEZ/yzCG9d0XOpnyAZ
-----END RSA PRIVATE KEY-----`

const recordedProductResponses: Record<string, AudibleProduct> = {
	B0036I54I6,
	B017V4IM1G,
	B08C6YJ1LS
}

// Route mocked fetchPlus calls to recorded fixtures so the standard suite
// never touches the network. Chapter metadata and product-page scrapes 404
// for B0036I54I6, matching the real API responses the fixture was built
// from; anything unrouted fails loudly instead of reaching the network.
const routeFetch = (url: string): Promise<AxiosResponse> => {
	const asin = /\/1\.0\/catalog\/products\/(\w+)/.exec(url)?.[1]
	const recorded = asin === undefined ? undefined : recordedProductResponses[asin]
	if (recorded !== undefined) {
		return Promise.resolve({ data: recorded, status: 200 } as AxiosResponse)
	}
	if (url.includes('/1.0/content/') || url.includes('/pd/')) {
		return Promise.reject({ status: 404 })
	}
	return Promise.reject(new Error(`Unexpected fetchPlus call in test: ${url}`))
}

let asin: string
let helper: StitchHelper
let response: ApiBook

// Live rating counts and the average star rating drift over time, so the
// snapshot comparison excludes `ratings` and the derived `rating` field; the
// ratings object is validated structurally instead.
function stripRatings(book: ApiBook): Partial<ApiBook> {
	const rest: Partial<ApiBook> = { ...book }
	delete rest.ratings
	delete rest.rating
	return rest
}

// Live contributor payloads also drift (e.g. newly added asins), so compare
// authors by name and order only.
function authorNames(book: ApiBook) {
	return book.authors.map((author) => author.name)
}

function expectRatingsConsistent(book: ApiBook) {
	expect(book.ratings).toBeDefined()
	expect(book.ratings?.value).toBe(book.rating)
	const distribution = book.ratings?.distribution
	expect(distribution).toBeDefined()
	if (!distribution) throw new Error('distribution expected to be defined')
	const totalStars =
		distribution.five + distribution.four + distribution.three + distribution.two + distribution.one
	expect(totalStars).toBe(book.ratings?.numRatings)
	expect(book.ratings?.numReviews).toBeGreaterThanOrEqual(0)
}
describe('Audible API and HTML Parsing', () => {
	beforeAll(() => {
		spyOn(fetchPlus, 'default').mockImplementation(routeFetch)
	})

	afterAll(() => {
		mock.restore()
	})

	describe('When stitching together Scorcerers Stone', () => {
		beforeAll(async () => {
			asin = 'B017V4IM1G'
			helper = new StitchHelper(asin, 'us')
			const newBook = await helper.process()
			response = newBook
		}, 10000)

		it('returned the correct data', () => {
			expect(stripRatings(response)).toEqual(stripRatings(combinedB017V4IM1G))
			expectRatingsConsistent(response)
		})
	})

	describe('When stitching together The Coldest Case', () => {
		beforeAll(async () => {
			asin = 'B08C6YJ1LS'
			helper = new StitchHelper(asin, 'us')
			const newBook = await helper.process()
			response = newBook
		}, 10000)

		it('returned the correct data', () => {
			expect(stripRatings(response)).toEqual(stripRatings(combinedB08C6YJ1LS))
			expectRatingsConsistent(response)
		})
	})

	describe('When fetching an ASIN that has no chapters or HTML', () => {
		let chapterError!: NotFoundError
		let chapterHelper: ChapterHelper
		beforeAll(async () => {
			asin = 'B0036I54I6'
			helper = new StitchHelper(asin, 'us')
			try {
				chapterHelper = new ChapterHelper(asin, 'us')
				await chapterHelper.process()
				fail('Expected NotFoundError to be thrown')
			} catch (e) {
				if (e instanceof NotFoundError) {
					chapterError = e
				} else {
					throw e
				}
			}
			const newBook = await helper.process()
			response = newBook
		}, 10000)

		it('returned the correct data', () => {
			expect(stripRatings(response)).toEqual(stripRatings(minimalB0036I54I6))
			expect(authorNames(response)).toEqual(authorNames(minimalB0036I54I6))
			expectRatingsConsistent(response)
		})

		it('throws NotFoundError for chapters with correct properties', () => {
			expect(chapterError).toBeInstanceOf(NotFoundError)
			expect(chapterError.statusCode).toBe(404)
			expect(chapterError.details?.code).toBe('REGION_UNAVAILABLE')
			expect(chapterError.message).toContain('Item not available in region')
		})
	})
})
