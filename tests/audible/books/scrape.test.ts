import { CheerioAPI } from 'cheerio'

import { HtmlBook } from '#config/typing/books'
import ScrapeHelper from '#helpers/books/audible/ScrapeHelper'
import {
	parsedB08C6YJ1LS,
	parsedB08G9PRS1K,
	parsedB017V4IM1G
} from '#tests/datasets/audible/books/scrape'

let asin: string
let helper: ScrapeHelper

describe('Audible HTML', () => {
	describe('When scraping Project Hail Mary genres', () => {
		let response: HtmlBook
		beforeAll(async () => {
			asin = 'B08G9PRS1K'
			helper = new ScrapeHelper(asin)
			const fetched = await helper.fetchBook()
			const parsed = await helper.parseResponse(fetched)
			if (!parsed) throw new Error('Parsed is undefined')
			response = parsed
		})

		it('returned the correct data', () => {
			expect(response).toEqual(parsedB08G9PRS1K)
		})
	})

	describe('When scraping Scorcerers Stone genres/series', () => {
		let response: HtmlBook
		beforeAll(async () => {
			asin = 'B017V4IM1G'
			helper = new ScrapeHelper(asin)
			const fetched = await helper.fetchBook()
			const parsed = await helper.parseResponse(fetched)
			if (!parsed) throw new Error('Parsed is undefined')
			response = parsed
		})

		it('returned the correct data', () => {
			expect(response).toEqual(parsedB017V4IM1G)
		})
	})

	// Run through single series book
	describe('When fetching The Coldest Case HTML', () => {
		let response: HtmlBook
		beforeAll(async () => {
			asin = 'B08C6YJ1LS'
			helper = new ScrapeHelper(asin)
			const fetched = await helper.fetchBook()
			const parsed = await helper.parseResponse(fetched)
			if (!parsed) throw new Error('Parsed is undefined')
			response = parsed
		})

		it('returned the correct data', () => {
			expect(response).toEqual(parsedB08C6YJ1LS)
		})
	})

	// Run through known book data to test responses
	describe('When scraping The Martian', () => {
		let response: CheerioAPI | undefined
		beforeAll(async () => {
			asin = 'B00B5HZGUG'
			helper = new ScrapeHelper(asin)
			const fetched = await helper.fetchBook()
			response = fetched
		})

		it('returned undefined', () => {
			expect(response).toBeUndefined()
		})
	})

	describe("When fetching a broken ASIN's HTML", () => {
		let response: HtmlBook | undefined
		beforeAll(async () => {
			asin = 'B0036I54I6'
			helper = new ScrapeHelper(asin)
			const fetched = await helper.fetchBook()
			const parsed = await helper.parseResponse(fetched)
			response = parsed
		})

		it('returned undefined', () => {
			expect(response).toBeUndefined()
		})
	})

	test.todo('When fetching a book with no genres')

	test.todo('WHen fetching a book with only 1 genre')
})
