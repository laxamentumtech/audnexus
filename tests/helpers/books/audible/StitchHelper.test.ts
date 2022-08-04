import * as cheerio from 'cheerio'

import ApiHelper from '#helpers/books/audible/ApiHelper'
import ScrapeHelper from '#helpers/books/audible/ScrapeHelper'
import StitchHelper from '#helpers/books/audible/StitchHelper'
import {
	apiResponse,
	genresObject,
	htmlResponse,
	parsedBook,
	parsedBookWithGenres
} from '#tests/datasets/helpers/books'

let asin: string
let helper: StitchHelper

beforeEach(() => {
	asin = 'B079LRSMNN'
	// Set up helpers
	helper = new StitchHelper(asin)
})

describe('StitchHelper should', () => {
	beforeEach(() => {
		jest.spyOn(helper.apiHelper, 'fetchBook').mockImplementation(() => Promise.resolve(apiResponse))
		jest
			.spyOn(global, 'fetch')
			.mockImplementationOnce(() =>
				Promise.resolve({ ok: true, status: 200, text: () => htmlResponse } as unknown as Response)
			)
	})

	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.apiHelper).toBeInstanceOf(ApiHelper)
		expect(helper.scrapeHelper).toBeInstanceOf(ScrapeHelper)
	})

	test('fetch sources', async () => {
		await helper.fetchSources()
		expect(helper.apiResponse).toEqual(apiResponse)
		expect(helper.scraperResponse.html()).toEqual(cheerio.load(htmlResponse).html())
	})

	test('parse responses', async () => {
		await helper.fetchSources()
		await helper.parseResponses()
		expect(helper.apiParsed).toEqual(parsedBook)
		expect(helper.scraperParsed).toEqual(genresObject)
	})

	test('include genres if genres exist', async () => {
		await helper.fetchSources()
		await helper.parseResponses()
		await expect(helper.includeGenres()).resolves.toEqual(parsedBookWithGenres)
	})

	test('process book', async () => {
		const proccessed = await helper.process()

		expect(proccessed).toEqual(parsedBookWithGenres)
		expect(helper.apiResponse).toEqual(apiResponse)
		expect(helper.scraperResponse.html()).toEqual(cheerio.load(htmlResponse).html())
		expect(helper.apiParsed).toEqual(parsedBook)
		expect(helper.scraperParsed).toEqual(genresObject)
	})
})

describe('StitchHelper should throw error when', () => {
	beforeEach(() => {
		// Mock Fetch to fail
		jest.spyOn(global, 'fetch').mockImplementation(() => Promise.reject({ status: 400, ok: false }))
	})

	test('fetching book data fails', async () => {
		await expect(helper.fetchSources()).rejects.toThrowError(
			`Error occured while fetching data from API or scraper: Error: An error has occured while fetching from Audible API. Response: 400, ASIN: ${asin}`
		)
	})
	test('parsing book data fails', async () => {
		await expect(helper.parseResponses()).rejects.toThrowError(
			'Error occured while parsing data from API or scraper: Error: No API response to parse'
		)
	})
})
