/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as cheerio from 'cheerio'

import ScrapeHelper from '#helpers/books/audible/ScrapeHelper'
import { genresObject, htmlResponse } from '#tests/datasets/helpers/books'

let asin: string
let helper: ScrapeHelper
let region: string

beforeEach(() => {
	asin = 'B079LRSMNN'
	region = 'us'
	// Set up helpers
	helper = new ScrapeHelper(asin, region)
})

describe('ScrapeHelper should', () => {
	beforeEach(() => {
		jest
			.spyOn(global, 'fetch')
			.mockImplementationOnce(() =>
				Promise.resolve({ ok: true, status: 200, text: () => htmlResponse } as unknown as Response)
			)
	})
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.reqUrl).toBe(`https://www.audible.com/pd/${asin}/`)
	})

	test('fetch book', async () => {
		const book = await helper.fetchBook()
		expect(book!.html()).toEqual(cheerio.load(htmlResponse).html())
	})

	test.todo('log error message if no book found')

	test('return error if no book', async () => {
		asin = asin.slice(0, -1)
		helper = new ScrapeHelper(asin, region)
		jest.restoreAllMocks()
		jest
			.spyOn(global, 'fetch')
			.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 404 } as Response))
		await expect(helper.fetchBook()).resolves.toBeUndefined()
	})

	test('parse response', async () => {
		const book = await helper.fetchBook()
		await expect(helper.parseResponse(book)).resolves.toEqual(genresObject)
	})

	test('return undefined if no dom for parse response', async () => {
		await expect(helper.parseResponse(undefined)).resolves.toBeUndefined()
	})

	test('return undefined if no genres', async () => {
		await expect(helper.parseResponse(cheerio.load(''))).resolves.toBeUndefined()
	})

	test('log non-404 status code', async () => {
		jest.restoreAllMocks()
		jest.spyOn(global.console, 'log')
		jest
			.spyOn(global, 'fetch')
			.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 500 } as Response))
		await expect(helper.fetchBook()).resolves.toBeUndefined()
		expect(console.log).toHaveBeenCalledWith(
			'An error occured while fetching data from HTML. Response: 500, ASIN: B079LRSMNN'
		)
	})
})
