import { ApiChapter, AudibleChapter } from '#config/types'
import ChapterHelper from '#helpers/books/audible/ChapterHelper'
import { NotFoundError } from '#helpers/errors/ApiErrors'
import {
	chapterParsed1721358595,
	chapterResponseB017V4IM1G
} from '#tests/datasets/audible/books/chapter'

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

let asin: string
let helper: ChapterHelper

// Run through known book data to test responses
describe('Audible API', () => {
	describe('When fetching Project Hail Mary chapters', () => {
		let response: AudibleChapter
		beforeAll(async () => {
			asin = 'B017V4IM1G'
			helper = new ChapterHelper(asin, 'us')
			const fetched = await helper.fetchChapter()
			if (!fetched) throw new Error('Parsed is undefined')
			response = fetched
		}, 10000)

		it.skip('returned the correct data - SKIPPED: requires valid Audible API credentials', () => {
			expect(response).toEqual(chapterResponseB017V4IM1G)
		})
	})

	// Run through chapter parsing of a book with bad names
	describe('When parsing The Seep', () => {
		let response: ApiChapter
		beforeAll(async () => {
			asin = '1721358595'
			helper = new ChapterHelper(asin, 'us')
			const fetched = await helper.fetchChapter()
			const parsed = await helper.parseResponse(fetched)
			if (!parsed) throw new Error('Parsed is undefined')
			response = parsed
		}, 10000)

		it.skip('returned the correct data - SKIPPED: requires valid Audible API credentials', () => {
			expect(response).toEqual(chapterParsed1721358595)
		})
	})

	describe("When fetching a broken ASIN's chapters", () => {
		let error: NotFoundError
		beforeAll(async () => {
			asin = 'B0036I54I6'
			helper = new ChapterHelper(asin, 'us')
			const fetched = await helper.fetchChapter()
			try {
				await helper.parseResponse(fetched)
				fail('Expected NotFoundError to be thrown')
			} catch (e) {
				error = e as NotFoundError
			}
		}, 10000)

		it('throws NotFoundError with correct properties', () => {
			expect(error).toBeInstanceOf(NotFoundError)
			expect(error.statusCode).toBe(404)
			expect(error.details?.code).toBe('REGION_UNAVAILABLE')
			expect(error.message).toContain('Item not available in region')
		})
	})
})
