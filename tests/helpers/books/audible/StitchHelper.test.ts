import * as cheerio from 'cheerio'

import { AudibleProduct, Book } from '#config/types'
import ApiHelper from '#helpers/books/audible/ApiHelper'
import StitchHelper from '#helpers/books/audible/StitchHelper'
import * as fetchPlus from '#helpers/utils/fetchPlus'
import { ErrorMessageHTTPFetch, ErrorMessageParse } from '#static/messages'
import {
	apiResponse,
	genresObject,
	htmlResponse,
	parsedBook,
	parsedBookWithGenres
} from '#tests/datasets/helpers/books'

jest.mock('#helpers/books/audible/ApiHelper')
jest.mock('#helpers/utils/shared')
jest.mock('#helpers/books/audible/ScrapeHelper')
jest.mock('#helpers/utils/fetchPlus')

let asin: string
let helper: StitchHelper
let mockApiResponse: AudibleProduct
let mockHTMLResponse: cheerio.CheerioAPI
let region: string
const deepCopy = (obj: unknown) => JSON.parse(JSON.stringify(obj))

beforeEach(() => {
	asin = 'B079LRSMNN'
	region = 'us'
	mockApiResponse = deepCopy(apiResponse)
	mockHTMLResponse = cheerio.load(htmlResponse)
	// Set up helpers
	helper = new StitchHelper(asin, region)
})

describe('StitchHelper should', () => {
	beforeEach(() => {
		// Set up spys
		jest
			.spyOn(helper.apiHelper, 'fetchBook')
			.mockImplementation(() => Promise.resolve(mockApiResponse))
		jest
			.spyOn(helper.apiHelper, 'parseResponse')
			.mockImplementation(() => Promise.resolve(parsedBook))
		jest
			.spyOn(helper.scrapeHelper, 'fetchBook')
			.mockImplementation(() => Promise.resolve(mockHTMLResponse))
		jest
			.spyOn(helper.scrapeHelper, 'parseResponse')
			.mockImplementation(() => Promise.resolve(genresObject))
	})

	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.apiHelper).toBeInstanceOf(ApiHelper)
	})

	test('fetch API source', async () => {
		await helper.fetchApiBook()
		expect(helper.apiResponse).toEqual(mockApiResponse)
	})

	test('parse API source', async () => {
		await helper.fetchApiBook()
		await helper.parseApiResponse()
		expect(helper.apiParsed).toEqual(parsedBook)
	})

	test('parse HTML source', async () => {
		await helper.fetchScraperBook()
		await helper.parseScraperResponse()
		expect(helper.scraperParsed).toEqual(genresObject)
	})

	test('process book', async () => {
		const proccessed = await helper.process()

		expect(proccessed).toEqual(parsedBookWithGenres)
		expect(helper.apiResponse).toEqual(mockApiResponse)
		expect(helper.apiParsed).toEqual(parsedBook)
	})
})

describe('SitchHelper should handle fallback', () => {
	beforeEach(() => {
		// Set up spys
		jest
			.spyOn(helper.apiHelper, 'parseResponse')
			.mockImplementation(() => Promise.resolve(parsedBook))
		jest
			.spyOn(helper.scrapeHelper, 'parseResponse')
			.mockImplementation(() => Promise.resolve(genresObject))
		jest
			.spyOn(helper.sharedHelper, 'sortObjectByKeys')
			.mockImplementation(() => parsedBookWithGenres)
	})

	test('and includeGenres properly', async () => {
		const obj = { data: mockApiResponse }
		obj.data.product.category_ladders = []
		jest.spyOn(helper.apiHelper, 'fetchBook').mockImplementation(() => Promise.resolve(obj.data))
		await helper.process()
		expect(helper.scraperParsed).toEqual(genresObject)
	})

	test('and include no genres', async () => {
		const obj = { data: mockApiResponse }
		// Mock no genres from api
		obj.data.product.category_ladders = []
		// Mock no genres from scrape
		const parsed = deepCopy(parsedBook)
		delete parsed.genres
		// Set spys
		jest.spyOn(helper.apiHelper, 'fetchBook').mockImplementation(() => Promise.resolve(obj.data))
		jest
			.spyOn(helper.scrapeHelper, 'fetchBook')
			.mockImplementation(() => Promise.resolve(undefined))
		jest
			.spyOn(helper.scrapeHelper, 'parseResponse')
			.mockImplementation(() => Promise.resolve(undefined))
		jest.spyOn(helper.apiHelper, 'parseResponse').mockImplementation(() => Promise.resolve(parsed))

		const processed = await helper.process()
		expect(processed).toEqual(parsed)
		expect(helper.scraperParsed).toBeUndefined()
	})
})

describe('StitchHelper should throw error when', () => {
	beforeEach(() => {
		// Mock Fetch to fail
		jest.spyOn(fetchPlus, 'default').mockImplementation(() => Promise.reject({ status: 400 }))
		jest
			.spyOn(helper.apiHelper, 'fetchBook')
			.mockRejectedValue(new Error(ErrorMessageHTTPFetch(asin, 400, 'Audible API')))
		jest.spyOn(helper.scrapeHelper, 'fetchBook').mockResolvedValue(undefined)
		jest.spyOn(helper.scrapeHelper, 'parseResponse').mockResolvedValue(undefined)
		jest
			.spyOn(helper.apiHelper, 'parseResponse')
			.mockRejectedValue(new Error(ErrorMessageParse(asin, 'Audible API')))
	})

	test('fetching api book data fails completely', async () => {
		await expect(helper.fetchApiBook()).rejects.toThrowError(
			`An error occured while fetching data from Audible API. Response: 400, ASIN: ${asin}`
		)
	})

	test('fetching scraper book data fails completely', async () => {
		await expect(helper.fetchScraperBook()).resolves.toBeUndefined()
	})

	test('fetching scraper book data throws an error', async () => {
		jest
			.spyOn(helper.scrapeHelper, 'fetchBook')
			.mockRejectedValueOnce(new Error(ErrorMessageHTTPFetch(asin, 400, 'Audible HTML')))
		await expect(helper.fetchScraperBook()).rejects.toThrowError(
			`An error occured while fetching data from Audible HTML. Response: 400, ASIN: ${asin}`
		)
	})

	test('parsing api book data fails', async () => {
		await expect(helper.parseApiResponse()).rejects.toThrowError(
			`An error occurred while parsing Audible API. ASIN: ${asin}`
		)
	})

	test('parsing scraper book data fails', async () => {
		await expect(helper.parseScraperResponse()).resolves.toBeUndefined()
	})

	test('parsing scraper book throws an error', async () => {
		jest
			.spyOn(helper.scrapeHelper, 'parseResponse')
			.mockRejectedValueOnce(new Error(ErrorMessageParse(asin, 'Audible HTML')))
		await expect(helper.parseScraperResponse()).rejects.toThrowError(
			`An error occurred while parsing Audible HTML. ASIN: ${asin}`
		)
	})

	test('processing book fails', async () => {
		jest.spyOn(helper, 'fetchApiBook').mockImplementation()
		helper.apiHelper.audibleResponse = {
			asin: 'B07JZQZQZQ'
		} as unknown as AudibleProduct['product']
		await expect(helper.process()).rejects.toThrowError(
			`An error occurred while parsing Audible API. ASIN: ${asin}`
		)
	})

	test('includeGenres returns a non-book type', async () => {
		jest
			.spyOn(helper.sharedHelper, 'sortObjectByKeys')
			.mockImplementation(() => Promise.resolve(genresObject) as unknown as Book)
		helper.scraperParsed = genresObject
		await expect(helper.includeGenres()).rejects.toThrowError(
			`An error occurred while sorting book json: ${asin}`
		)
	})
})
