import * as cheerio from 'cheerio'

import { setPerformanceConfig } from '#config/performance'
import { ApiBook, AudibleProduct } from '#config/types'
import ApiHelper from '#helpers/books/audible/ApiHelper'
import StitchHelper from '#helpers/books/audible/StitchHelper'
import { BadRequestError, NotFoundError } from '#helpers/errors/ApiErrors'
import * as fetchPlus from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'
import { ErrorMessageHTTPFetch, ErrorMessageParse } from '#static/messages'
import {
	apiResponse,
	genresObject,
	htmlResponse,
	parsedBook,
	parsedBookWithGenres
} from '#tests/datasets/helpers/books'

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
	jest
		.spyOn(SharedHelper.prototype, 'buildUrl')
		.mockReturnValue('https://api.audible.com/1.0/catalog/products/B079LRSMNN')
	jest.spyOn(SharedHelper.prototype, 'getParamString').mockReturnValue('test_params')
	jest.spyOn(fetchPlus, 'default').mockImplementation(() => {
		return Promise.reject(new Error('Unexpected fetch call'))
	})
})

describe('StitchHelper should', () => {
	beforeEach(() => {
		helper = new StitchHelper(asin, region)
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
		helper = new StitchHelper(asin, region)
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
		helper = new StitchHelper(asin, region)
		jest.spyOn(helper.scrapeHelper, 'fetchBook').mockResolvedValue(undefined)
		jest.spyOn(helper.scrapeHelper, 'parseResponse').mockResolvedValue(undefined)
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	test('fetching api book data fails completely', async () => {
		jest
			.spyOn(helper.apiHelper, 'fetchBook')
			.mockImplementation(() =>
				Promise.reject(new Error(ErrorMessageHTTPFetch(asin, 400, 'Audible API')))
			)
		await expect(helper.fetchApiBook()).rejects.toThrow(
			`An error occured while fetching data from Audible API. Response: 400, ASIN: ${asin}`
		)
	})

	test('fetching scraper book data fails completely', async () => {
		await expect(helper.fetchScraperBook()).resolves.toBeUndefined()
	})

	test('fetching scraper book data throws an error', async () => {
		jest
			.spyOn(helper.scrapeHelper, 'fetchBook')
			.mockImplementation(() =>
				Promise.reject(new Error(ErrorMessageHTTPFetch(asin, 400, 'Audible HTML')))
			)
		await expect(helper.fetchScraperBook()).rejects.toThrow(
			`An error occured while fetching data from Audible HTML. Response: 400, ASIN: ${asin}`
		)
	})

	test('parsing api book data fails', async () => {
		jest
			.spyOn(helper.apiHelper, 'parseResponse')
			.mockImplementation(() => Promise.reject(new Error(ErrorMessageParse(asin, 'Audible API'))))
		await expect(helper.parseApiResponse()).rejects.toThrow(
			`An error occurred while parsing Audible API. ASIN: ${asin}`
		)
	})

	test('parsing scraper book data fails', async () => {
		await expect(helper.parseScraperResponse()).resolves.toBeUndefined()
	})

	test('parsing scraper book throws an error', async () => {
		jest
			.spyOn(helper.scrapeHelper, 'parseResponse')
			.mockImplementation(() => Promise.reject(new Error(ErrorMessageParse(asin, 'Audible HTML'))))
		await expect(helper.parseScraperResponse()).rejects.toThrow(
			`An error occurred while parsing Audible HTML. ASIN: ${asin}`
		)
	})

	test('processing book fails', async () => {
		jest.spyOn(helper, 'fetchApiBook').mockImplementation()
		helper.apiResponse = {
			product: { asin: 'B07JZQZQZQ' }
		} as unknown as AudibleProduct
		jest
			.spyOn(helper.apiHelper, 'parseResponse')
			.mockImplementation(() => Promise.reject(new Error(ErrorMessageParse(asin, 'Audible API'))))
		await expect(helper.process()).rejects.toThrow(
			`An error occurred while parsing Audible API. ASIN: ${asin}`
		)
	})

	test('includeGenres returns a non-book type', async () => {
		// Enable USE_SORTED_KEYS to test sorting error handling
		setPerformanceConfig({
			USE_PARALLEL_SCHEDULER: false,
			USE_CONNECTION_POOLING: true,
			USE_COMPACT_JSON: true,
			USE_SORTED_KEYS: true,
			CIRCUIT_BREAKER_ENABLED: true,
			METRICS_ENABLED: true,
			MAX_CONCURRENT_REQUESTS: 50,
			SCHEDULER_CONCURRENCY: 5,
			SCHEDULER_MAX_PER_REGION: 5,
			DEFAULT_REGION: 'us'
		})
		helper.apiParsed = parsedBook
		jest
			.spyOn(helper.sharedHelper, 'sortObjectByKeys')
			.mockImplementation(() => genresObject as unknown as ApiBook)
		helper.scraperParsed = genresObject
		await expect(helper.includeGenres()).rejects.toThrow(
			`An error occurred while sorting book json: ${asin}`
		)
	})

	test('fetchApiBook rethrows NotFoundError without wrapping', async () => {
		const notFoundError = new NotFoundError('Not found')
		jest.spyOn(helper.apiHelper, 'fetchBook').mockRejectedValue(notFoundError)
		await expect(helper.fetchApiBook()).rejects.toBe(notFoundError)
		expect(notFoundError.statusCode).toBe(404)
	})

	test('fetchApiBook rethrows BadRequestError without wrapping', async () => {
		const badRequestError = new BadRequestError('Bad request')
		jest.spyOn(helper.apiHelper, 'fetchBook').mockRejectedValue(badRequestError)
		await expect(helper.fetchApiBook()).rejects.toBe(badRequestError)
		expect(badRequestError.statusCode).toBe(400)
	})

	test('fetchScraperBook rethrows NotFoundError without wrapping', async () => {
		const notFoundError = new NotFoundError('Not found')
		jest.spyOn(helper.scrapeHelper, 'fetchBook').mockRejectedValue(notFoundError)
		await expect(helper.fetchScraperBook()).rejects.toBe(notFoundError)
		expect(notFoundError.statusCode).toBe(404)
	})

	test('fetchScraperBook rethrows BadRequestError without wrapping', async () => {
		const badRequestError = new BadRequestError('Bad request')
		jest.spyOn(helper.scrapeHelper, 'fetchBook').mockRejectedValue(badRequestError)
		await expect(helper.fetchScraperBook()).rejects.toBe(badRequestError)
		expect(badRequestError.statusCode).toBe(400)
	})

	test('parseApiResponse rethrows NotFoundError without wrapping', async () => {
		helper.apiResponse = mockApiResponse
		const notFoundError = new NotFoundError('Not found')
		jest.spyOn(helper.apiHelper, 'parseResponse').mockRejectedValue(notFoundError)
		await expect(helper.parseApiResponse()).rejects.toBe(notFoundError)
		expect(notFoundError.statusCode).toBe(404)
	})

	test('parseApiResponse rethrows BadRequestError without wrapping', async () => {
		helper.apiResponse = mockApiResponse
		const badRequestError = new BadRequestError('Bad request')
		jest.spyOn(helper.apiHelper, 'parseResponse').mockRejectedValue(badRequestError)
		await expect(helper.parseApiResponse()).rejects.toBe(badRequestError)
		expect(badRequestError.statusCode).toBe(400)
	})

	test('parseScraperResponse rethrows NotFoundError without wrapping', async () => {
		helper.scraperResponse = mockHTMLResponse
		const notFoundError = new NotFoundError('Not found')
		jest.spyOn(helper.scrapeHelper, 'parseResponse').mockRejectedValue(notFoundError)
		await expect(helper.parseScraperResponse()).rejects.toBe(notFoundError)
		expect(notFoundError.statusCode).toBe(404)
	})

	test('parseScraperResponse rethrows BadRequestError without wrapping', async () => {
		helper.scraperResponse = mockHTMLResponse
		const badRequestError = new BadRequestError('Bad request')
		jest.spyOn(helper.scrapeHelper, 'parseResponse').mockRejectedValue(badRequestError)
		await expect(helper.parseScraperResponse()).rejects.toBe(badRequestError)
		expect(badRequestError.statusCode).toBe(400)
	})
})
