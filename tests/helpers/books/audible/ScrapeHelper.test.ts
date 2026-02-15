/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { AxiosResponse } from 'axios'
import * as cheerio from 'cheerio'
import type { FastifyBaseLogger } from 'fastify'

import ScrapeHelper from '#helpers/books/audible/ScrapeHelper'
import * as fetchPlus from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'
import { genresObject, htmlResponse } from '#tests/datasets/helpers/books'

jest.mock('#helpers/utils/fetchPlus')
jest.mock('#helpers/utils/shared')

let asin: string
let helper: ScrapeHelper
let mockResponse: string
let region: string
let url: string
const deepCopy = (obj: unknown) => JSON.parse(JSON.stringify(obj))

beforeEach(() => {
	// Variables
	asin = 'B079LRSMNN'
	region = 'us'
	url = `https://www.audible.com/pd/${asin}/`
	mockResponse = deepCopy(htmlResponse)
	// Set up spys
	jest.spyOn(SharedHelper.prototype, 'buildUrl').mockReturnValue(url)
	jest
		.spyOn(fetchPlus, 'default')
		.mockImplementation(() => Promise.resolve({ data: mockResponse, status: 200 } as AxiosResponse))
	// Set up helpers
	helper = new ScrapeHelper(asin, region)
})

describe('ScrapeHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.reqUrl).toBe(url)
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
		jest.spyOn(fetchPlus, 'default').mockImplementationOnce(() => Promise.reject({ status: 404 }))
		await expect(helper.fetchBook()).resolves.toBeUndefined()
	})

	test('parse response', async () => {
		jest
			.spyOn(SharedHelper.prototype, 'collectGenres')
			.mockReturnValueOnce([genresObject.genres[0]])
		jest
			.spyOn(SharedHelper.prototype, 'collectGenres')
			.mockReturnValueOnce([genresObject.genres[1]])
		const book = await helper.fetchBook()
		await expect(helper.parseResponse(book)).resolves.toEqual(genresObject)
	})

	test('return undefined if no dom for parse response', async () => {
		await expect(helper.parseResponse(undefined)).resolves.toBeUndefined()
	})

	test('return undefined if no genres', async () => {
		jest.spyOn(SharedHelper.prototype, 'collectGenres').mockReturnValue([])
		await expect(helper.parseResponse(cheerio.load(''))).resolves.toBeUndefined()
	})

	test('log non-404 status code', async () => {
		jest.restoreAllMocks()
		const mockLogger = { info: jest.fn() }
		jest.spyOn(fetchPlus, 'default').mockImplementationOnce(() => Promise.reject({ status: 500 }))
		helper = new ScrapeHelper(asin, region, mockLogger as unknown as FastifyBaseLogger)
		await expect(helper.fetchBook()).resolves.toBeUndefined()
		expect(mockLogger.info).toHaveBeenCalledWith(
			'An error occured while fetching data from HTML. Response: 500, ASIN: B079LRSMNN'
		)
	})
})
