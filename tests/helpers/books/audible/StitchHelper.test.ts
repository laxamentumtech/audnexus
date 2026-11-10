import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import * as cheerio from 'cheerio'

import type { BookObservation } from '#config/bookHistory'
import { GENRES_API_POLICY, GENRES_HTML_POLICY } from '#config/bookHistory'
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
import { createTestPerformanceConfig } from '#tests/setup/performanceConfig'

mock.module('#helpers/utils/fetchPlus', () => {
	return { default: mock() }
})

mock.module('#helpers/utils/shared', () => {
	return {
		default: class SharedHelper {
			buildUrl() {
				return ''
			}
			getParamString() {
				return ''
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			sortObjectByKeys(obj: any) {
				return obj
			}
		}
	}
})

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
	spyOn(SharedHelper.prototype, 'buildUrl').mockReturnValue(
		'https://api.audible.com/1.0/catalog/products/B079LRSMNN'
	)
	spyOn(SharedHelper.prototype, 'getParamString').mockReturnValue('test_params')
	spyOn(fetchPlus, 'default').mockImplementation(() => {
		return Promise.reject(new Error('Unexpected fetch call'))
	})
})

describe('StitchHelper should', () => {
	beforeEach(() => {
		helper = new StitchHelper(asin, region)
		spyOn(helper.apiHelper, 'fetchBook').mockImplementation(() => Promise.resolve(mockApiResponse))
		spyOn(helper.apiHelper, 'parseResponse').mockImplementation(() => Promise.resolve(parsedBook))
		spyOn(helper.scrapeHelper, 'fetchBook').mockImplementation(() =>
			Promise.resolve(mockHTMLResponse)
		)
		spyOn(helper.scrapeHelper, 'parseResponse').mockImplementation(() =>
			Promise.resolve(genresObject)
		)
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
		spyOn(helper.apiHelper, 'parseResponse').mockImplementation(() => Promise.resolve(parsedBook))
		spyOn(helper.scrapeHelper, 'parseResponse').mockImplementation(() =>
			Promise.resolve(genresObject)
		)
		spyOn(helper.sharedHelper, 'sortObjectByKeys').mockImplementation(() => parsedBookWithGenres)
	})

	test('and includeGenres properly', async () => {
		const obj = { data: mockApiResponse }
		obj.data.product.category_ladders = []
		spyOn(helper.apiHelper, 'fetchBook').mockImplementation(() => Promise.resolve(obj.data))
		await helper.process()
		expect(helper.scraperParsed).toEqual(genresObject)
	})

	test('skip the scrape when skipHtml is set', async () => {
		// Background passes opt out of the product-page fetch: it only supplies
		// genres/tags and ladder-less rows answer 404/503.
		const obj = { data: mockApiResponse }
		obj.data.product.category_ladders = []
		const skipHelper = new StitchHelper(asin, region, undefined, false, true)
		spyOn(skipHelper.apiHelper, 'fetchBook').mockImplementation(() => Promise.resolve(obj.data))
		spyOn(skipHelper.apiHelper, 'parseResponse').mockImplementation(() =>
			Promise.resolve(parsedBook)
		)
		const scrapeFetch = spyOn(skipHelper.scrapeHelper, 'fetchBook')
		await skipHelper.process()
		expect(scrapeFetch).not.toHaveBeenCalled()
		expect(skipHelper.scraperParsed).toBeUndefined()
	})

	test('and include no genres', async () => {
		const obj = { data: mockApiResponse }
		obj.data.product.category_ladders = []
		const parsed = deepCopy(parsedBook)
		delete parsed.genres
		spyOn(helper.apiHelper, 'fetchBook').mockImplementation(() => Promise.resolve(obj.data))
		spyOn(helper.scrapeHelper, 'fetchBook').mockImplementation(() => Promise.resolve(undefined))
		spyOn(helper.scrapeHelper, 'parseResponse').mockImplementation(() => Promise.resolve(undefined))
		spyOn(helper.apiHelper, 'parseResponse').mockImplementation(() => Promise.resolve(parsed))

		const processed = await helper.process()
		expect(processed).toEqual(parsed)
		expect(helper.scraperParsed).toBeUndefined()
	})
})

describe('StitchHelper should throw error when', () => {
	beforeEach(() => {
		helper = new StitchHelper(asin, region)
		spyOn(helper.scrapeHelper, 'fetchBook').mockResolvedValue(undefined)
		spyOn(helper.scrapeHelper, 'parseResponse').mockResolvedValue(undefined)
	})

	afterEach(() => {
		mock.restore()
	})

	test('fetching api book data fails completely', async () => {
		spyOn(helper.apiHelper, 'fetchBook').mockImplementation(() =>
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
		spyOn(helper.scrapeHelper, 'fetchBook').mockImplementation(() =>
			Promise.reject(new Error(ErrorMessageHTTPFetch(asin, 400, 'Audible HTML')))
		)
		await expect(helper.fetchScraperBook()).rejects.toThrow(
			`An error occured while fetching data from Audible HTML. Response: 400, ASIN: ${asin}`
		)
	})

	test('parsing api book data fails', async () => {
		spyOn(helper.apiHelper, 'parseResponse').mockImplementation(() =>
			Promise.reject(new Error(ErrorMessageParse(asin, 'Audible API')))
		)
		await expect(helper.parseApiResponse()).rejects.toThrow(
			`An error occurred while parsing Audible API. ASIN: ${asin}`
		)
	})

	test('parsing scraper book data fails', async () => {
		await expect(helper.parseScraperResponse()).resolves.toBeUndefined()
	})

	test('parsing scraper book throws an error', async () => {
		spyOn(helper.scrapeHelper, 'parseResponse').mockImplementation(() =>
			Promise.reject(new Error(ErrorMessageParse(asin, 'Audible HTML')))
		)
		await expect(helper.parseScraperResponse()).rejects.toThrow(
			`An error occurred while parsing Audible HTML. ASIN: ${asin}`
		)
	})

	test('processing book fails', async () => {
		spyOn(helper, 'fetchApiBook').mockImplementation()
		helper.apiResponse = {
			product: { asin: 'B07JZQZQZQ' }
		} as unknown as AudibleProduct
		spyOn(helper.apiHelper, 'parseResponse').mockImplementation(() =>
			Promise.reject(new Error(ErrorMessageParse(asin, 'Audible API')))
		)
		await expect(helper.process()).rejects.toThrow(
			`An error occurred while parsing Audible API. ASIN: ${asin}`
		)
	})

	test('includeGenres returns a non-book type', async () => {
		setPerformanceConfig(
			createTestPerformanceConfig({
				USE_SORTED_KEYS: true,
				METRICS_ENABLED: true
			})
		)
		helper.apiParsed = parsedBook
		spyOn(helper.sharedHelper, 'sortObjectByKeys').mockImplementation(
			() => genresObject as unknown as ApiBook
		)
		helper.scraperParsed = genresObject
		await expect(helper.includeGenres()).rejects.toThrow(
			`An error occurred while sorting book json: ${asin}`
		)
	})

	test('fetchApiBook rethrows NotFoundError without wrapping', async () => {
		const notFoundError = new NotFoundError('Not found')
		spyOn(helper.apiHelper, 'fetchBook').mockRejectedValue(notFoundError)
		await expect(helper.fetchApiBook()).rejects.toBe(notFoundError)
		expect(notFoundError.statusCode).toBe(404)
	})

	test('fetchApiBook rethrows BadRequestError without wrapping', async () => {
		const badRequestError = new BadRequestError('Bad request')
		spyOn(helper.apiHelper, 'fetchBook').mockRejectedValue(badRequestError)
		await expect(helper.fetchApiBook()).rejects.toBe(badRequestError)
		expect(badRequestError.statusCode).toBe(400)
	})

	test('fetchScraperBook rethrows NotFoundError without wrapping', async () => {
		const notFoundError = new NotFoundError('Not found')
		spyOn(helper.scrapeHelper, 'fetchBook').mockRejectedValue(notFoundError)
		await expect(helper.fetchScraperBook()).rejects.toBe(notFoundError)
		expect(notFoundError.statusCode).toBe(404)
	})

	test('fetchScraperBook rethrows BadRequestError without wrapping', async () => {
		const badRequestError = new BadRequestError('Bad request')
		spyOn(helper.scrapeHelper, 'fetchBook').mockRejectedValue(badRequestError)
		await expect(helper.fetchScraperBook()).rejects.toBe(badRequestError)
		expect(badRequestError.statusCode).toBe(400)
	})

	test('parseApiResponse rethrows NotFoundError without wrapping', async () => {
		helper.apiResponse = mockApiResponse
		const notFoundError = new NotFoundError('Not found')
		spyOn(helper.apiHelper, 'parseResponse').mockRejectedValue(notFoundError)
		await expect(helper.parseApiResponse()).rejects.toBe(notFoundError)
		expect(notFoundError.statusCode).toBe(404)
	})

	test('parseApiResponse rethrows BadRequestError without wrapping', async () => {
		helper.apiResponse = mockApiResponse
		const badRequestError = new BadRequestError('Bad request')
		spyOn(helper.apiHelper, 'parseResponse').mockRejectedValue(badRequestError)
		await expect(helper.parseApiResponse()).rejects.toBe(badRequestError)
		expect(badRequestError.statusCode).toBe(400)
	})

	test('parseScraperResponse rethrows NotFoundError without wrapping', async () => {
		helper.scraperResponse = mockHTMLResponse
		const notFoundError = new NotFoundError('Not found')
		spyOn(helper.scrapeHelper, 'parseResponse').mockRejectedValue(notFoundError)
		await expect(helper.parseScraperResponse()).rejects.toBe(notFoundError)
		expect(notFoundError.statusCode).toBe(404)
	})

	test('parseScraperResponse rethrows BadRequestError without wrapping', async () => {
		helper.scraperResponse = mockHTMLResponse
		const badRequestError = new BadRequestError('Bad request')
		spyOn(helper.scrapeHelper, 'parseResponse').mockRejectedValue(badRequestError)
		await expect(helper.parseScraperResponse()).rejects.toBe(badRequestError)
		expect(badRequestError.statusCode).toBe(400)
	})
})

describe('StitchHelper getHistoryObservation composition', () => {
	const apiTime = new Date('2026-11-07T12:00:00.000Z')
	const htmlTime = new Date('2026-11-07T12:00:05.000Z')
	const htmlGenres = [
		{ asin: '18580606011', name: 'Science Fiction & Fantasy', type: 'genre' },
		{ asin: '18580641011', name: 'Military', type: 'tag' }
	]

	const htmlCanonicalGenres = [
		['genre', '18580606011', 'Science Fiction & Fantasy'],
		['tag', '18580641011', 'Military']
	]
	const baseFields = [
		{ field: 'title', policy: 'editorial:title:v1', value: { state: 'value', value: 'Galaxy' }, source: 'audible_api' },
		{ field: 'genres', policy: GENRES_API_POLICY, value: { state: 'value', value: [] }, source: 'audible_api' }
	]

	const baseObservation = (): BookObservation => ({
		observedAt: apiTime,
		apiReceivedAt: apiTime,
		responseGroups: ['category_ladders'],
		requestedRenditions: ['500', '1024'],
		fields: JSON.parse(JSON.stringify(baseFields)),
		artwork: []
	})

	// Typed view over the private history-capture fields the composition
	// reads (set by fetchScraperBook/includeGenres during a live fetch).
	type HistoryState = StitchHelper & {
		htmlReceivedAt?: Date
		historyHtmlGenres?: typeof htmlGenres
	}

	const setupHelper = (captureHistory: boolean): HistoryState => {
		const h = new StitchHelper(asin, region, undefined, captureHistory) as HistoryState
		spyOn(h.apiHelper, 'getHistoryObservation').mockImplementation(() => baseObservation())
		return h
	}

	test('uses the HTML receipt time when accepted HTML genres contributed', () => {
		const h = setupHelper(true)
		h.historyHtmlGenres = htmlGenres
		h.htmlReceivedAt = htmlTime

		const observation = h.getHistoryObservation()

		expect(observation).toBeDefined()
		expect(observation?.observedAt).toBe(htmlTime)
		expect(observation?.apiReceivedAt).toBe(apiTime)
		expect(observation?.htmlReceivedAt).toBe(htmlTime)
		const genres = observation?.fields.find((f) => f.field === 'genres')
		expect(genres?.source).toBe('audible_html')
		expect(genres?.policy).toBe(GENRES_HTML_POLICY)
		expect(genres?.value).toEqual({ state: 'value', value: htmlCanonicalGenres })
	})

	test('keeps the API receipt time when the HTML fetch produced no genres', () => {
		const h = setupHelper(true)
		// The HTML fetch succeeded (receipt time captured) but the page had no
		// genres: the observation must fall back to the API snapshot and the
		// API time — the HTML time only applies when HTML genres contributed.
		h.htmlReceivedAt = htmlTime
		expect(h.historyHtmlGenres).toBeUndefined()

		const observation = h.getHistoryObservation()

		expect(observation?.observedAt).toBe(apiTime)
		expect(observation?.apiReceivedAt).toBe(apiTime)
		expect(observation?.htmlReceivedAt).toBeUndefined()
		const genres = observation?.fields.find((f) => f.field === 'genres')
		expect(genres?.source).toBe('audible_api')
		expect(genres?.policy).toBe(GENRES_API_POLICY)
	})

	test('returns the API observation (undefined) when captureHistory is false', () => {
		const h = setupHelper(false)
		// A real ApiHelper built with `captureHistory: false` never captures
		// evidence, so `getHistoryObservation()` returns `undefined` — the
		// disabled path must pass that through, and must not synthesize an
		// observation from the HTML genre state below.
		spyOn(h.apiHelper, 'getHistoryObservation').mockImplementation(() => undefined)
		h.historyHtmlGenres = htmlGenres
		h.htmlReceivedAt = htmlTime

		expect(h.getHistoryObservation()).toBeUndefined()
	})
})

afterAll(() => {
	mock.restore()
})
