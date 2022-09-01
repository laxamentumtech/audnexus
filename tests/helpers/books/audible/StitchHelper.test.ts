import { Book } from '#config/typing/books'
import ApiHelper from '#helpers/books/audible/ApiHelper'
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
	})

	test('fetch sources', async () => {
		await helper.fetchSources()
		expect(helper.apiResponse).toEqual(apiResponse)
	})

	test('parse responses', async () => {
		await helper.fetchSources()
		await helper.parseResponses()
		expect(helper.apiParsed).toEqual(parsedBook)
	})

	test('return an untoched book with includeGenres', async () => {
		await helper.fetchSources()
		await helper.parseResponses()

		await expect(helper.includeGenres()).resolves.toEqual(parsedBook)
	})

	test('process book', async () => {
		const proccessed = await helper.process()

		expect(proccessed).toEqual(parsedBookWithGenres)
		expect(helper.apiResponse).toEqual(apiResponse)
		expect(helper.apiParsed).toEqual(parsedBook)
	})
})

describe('SitchHelper should handle fallback', () => {
	test('and includeGenres properly', async () => {
		const obj = { data: apiResponse }
		obj.data.product.category_ladders = []
		jest.spyOn(helper.apiHelper, 'fetchBook').mockImplementation(() => Promise.resolve(obj.data))
		jest.spyOn(global, 'fetch').mockImplementationOnce(() =>
			Promise.resolve({
				ok: true,
				status: 200,
				text: () => htmlResponse
			} as unknown as Response)
		)
		await helper.process()
		expect(helper.scraperParsed).toEqual(genresObject)
	})

	test('and include no genres', async () => {
		const obj = { data: apiResponse }
		obj.data.product.category_ladders = []
		jest.spyOn(helper.apiHelper, 'fetchBook').mockImplementation(() => Promise.resolve(obj.data))
		jest.spyOn(global, 'fetch').mockImplementationOnce(() =>
			Promise.resolve({
				ok: true,
				status: 200
			} as unknown as Response)
		)
		parsedBook.genres = []
		const processed = await helper.process()
		expect(processed).toEqual(parsedBook)
		expect(helper.scraperParsed).toBeUndefined()
	})
})

describe('StitchHelper should throw error when', () => {
	beforeEach(() => {
		// Mock Fetch to fail
		jest.spyOn(global, 'fetch').mockImplementation(() => Promise.reject({ status: 400, ok: false }))
	})

	test('fetching book data fails completely', async () => {
		await expect(helper.fetchSources()).rejects.toThrowError(
			`Error occured while fetching data from API or scraper: Error: An error has occured while fetching from Audible API. Response: 400, ASIN: ${asin}`
		)
	})

	test('fetching book data from API fails', async () => {
		const error = `An error has occured while fetching from Audible API. Response: 404, ASIN: ${asin}`
		jest.spyOn(helper.apiHelper, 'fetchBook').mockImplementation(() => Promise.reject(error))
		jest
			.spyOn(global, 'fetch')
			.mockImplementationOnce(() =>
				Promise.resolve({ ok: true, status: 200, text: () => htmlResponse } as unknown as Response)
			)
		await expect(helper.fetchSources()).rejects.toThrowError(error)
	})

	test('parsing book data fails', async () => {
		await expect(helper.parseResponses()).rejects.toThrowError(
			'Error occured while parsing data from API or scraper: Error: No API response to parse'
		)
	})

	test('includeGenres returns a non-book type', async () => {
		jest
			.spyOn(helper.sharedHelper, 'sortObjectByKeys')
			.mockImplementation(() => Promise.resolve(genresObject) as unknown as Book)
		helper.scraperParsed = genresObject
		await expect(helper.includeGenres()).rejects.toThrowError(
			`Error occured while sorting book json: ${asin}`
		)
	})
})
