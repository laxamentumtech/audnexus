import ApiHelper from '#helpers/books/audible/ApiHelper'
import StitchHelper from '#helpers/books/audible/StitchHelper'
import {
	apiResponse,
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

	test.todo('parse html genres')

	test('process book', async () => {
		const proccessed = await helper.process()

		expect(proccessed).toEqual(parsedBookWithGenres)
		expect(helper.apiResponse).toEqual(apiResponse)
		expect(helper.apiParsed).toEqual(parsedBook)
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
