import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import * as cheerio from 'cheerio'

import { HtmlBook } from '#config/types'
import ScrapeHelper from '#helpers/books/audible/ScrapeHelper'
import * as fetchPlus from '#helpers/utils/fetchPlus'
import {
	mockHtmlB08C6YJ1LS,
	mockHtmlB08G9PRS1K,
	mockHtmlB017V4IM1G,
	parsedB08C6YJ1LS,
	parsedB08G9PRS1K,
	parsedB017V4IM1G
} from '#tests/datasets/audible/books/scrape'

jest.mock('#helpers/utils/fetchPlus')

let asin: string
let helper: ScrapeHelper

const createMockResponse = (data: string, status: number): AxiosResponse => ({
	data,
	status,
	statusText: status === 200 ? 'OK' : 'Not Found',
	headers: {},
	config: {} as InternalAxiosRequestConfig
})

describe('Audible HTML', () => {
	describe('When scraping Project Hail Mary genres', () => {
		let response: HtmlBook
		beforeAll(async () => {
			asin = 'B08G9PRS1K'
			helper = new ScrapeHelper(asin, 'us')
			jest
				.spyOn(fetchPlus, 'default')
				.mockImplementation(() => Promise.resolve(createMockResponse(mockHtmlB08G9PRS1K, 200)))
			const fetched = await helper.fetchBook()
			const parsed = await helper.parseResponse(fetched)
			if (!parsed) throw new Error('Parsed is undefined')
			response = parsed
		}, 10000)

		it('returned the correct data', () => {
			expect(response).toEqual(parsedB08G9PRS1K)
		})
	})

	describe('When scraping Scorcerers Stone genres/series', () => {
		let response: HtmlBook
		beforeAll(async () => {
			asin = 'B017V4IM1G'
			helper = new ScrapeHelper(asin, 'us')
			jest
				.spyOn(fetchPlus, 'default')
				.mockImplementation(() => Promise.resolve(createMockResponse(mockHtmlB017V4IM1G, 200)))
			const fetched = await helper.fetchBook()
			const parsed = await helper.parseResponse(fetched)
			if (!parsed) throw new Error('Parsed is undefined')
			response = parsed
		}, 10000)

		it('returned the correct data', () => {
			expect(response).toEqual(parsedB017V4IM1G)
		})
	})

	describe('When fetching The Coldest Case HTML', () => {
		let response: HtmlBook
		beforeAll(async () => {
			asin = 'B08C6YJ1LS'
			helper = new ScrapeHelper(asin, 'us')
			jest
				.spyOn(fetchPlus, 'default')
				.mockImplementation(() => Promise.resolve(createMockResponse(mockHtmlB08C6YJ1LS, 200)))
			const fetched = await helper.fetchBook()
			const parsed = await helper.parseResponse(fetched)
			if (!parsed) throw new Error('Parsed is undefined')
			response = parsed
		}, 10000)

		it('returned the correct data', () => {
			expect(response).toEqual(parsedB08C6YJ1LS)
		})
	})

	describe('When scraping The Martian', () => {
		let response: cheerio.CheerioAPI | undefined
		beforeAll(async () => {
			asin = 'B00B5HZGUG'
			helper = new ScrapeHelper(asin, 'us')
			jest.spyOn(fetchPlus, 'default').mockImplementation(() => Promise.reject({ status: 404 }))
			const fetched = await helper.fetchBook()
			response = fetched
		}, 10000)

		it('returned undefined', () => {
			expect(response).toBeUndefined()
		})
	})

	describe("When fetching a broken ASIN's HTML", () => {
		let response: HtmlBook | undefined
		beforeAll(async () => {
			asin = 'B0036I54I6'
			helper = new ScrapeHelper(asin, 'us')
			jest
				.spyOn(fetchPlus, 'default')
				.mockImplementation(() =>
					Promise.resolve(createMockResponse('<html><body></body></html>', 200))
				)
			const fetched = await helper.fetchBook()
			const parsed = await helper.parseResponse(fetched)
			response = parsed
		}, 10000)

		it('returned undefined', () => {
			expect(response).toBeUndefined()
		})
	})

	test.todo('When fetching a book with no genres')

	test.todo('WHen fetching a book with only 1 genre')
})
