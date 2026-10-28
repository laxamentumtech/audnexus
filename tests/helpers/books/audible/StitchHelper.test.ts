import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import * as cheerio from 'cheerio'

import { setPerformanceConfig } from '#config/performance'
import { ApiBook, AudibleProduct } from '#config/types'
import { authorNameIndex } from '#helpers/authorNameIndex/AuthorNameIndex'
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

const mockAuthorResolve = mock(() => Promise.resolve({}))

mock.module('#helpers/authorNameIndex/AuthorNameIndex', () => ({
	authorNameIndex: {
		resolve: mockAuthorResolve,
		invalidate: mock(),
		build: mock(),
		isReady: () => true
	}
}))

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

describe('StitchHelper should enrich author ASINs', () => {
	beforeEach(() => {
		helper = new StitchHelper(asin, region)
		mockAuthorResolve.mockReset()
		mockAuthorResolve.mockImplementation(async (name: string) => {
			const normalized = name.trim().replace(/\s+/g, ' ').toLowerCase()
			if (normalized === 'jason anspach') return { asin: 'B012DQ3BCM' }
			if (normalized === 'ambiguous author') {
				return { candidates: ['B00000000X', 'B00000000Y'] }
			}
			return {}
		})
		// mockApiResponse has non-empty category_ladders, so process() skips
		// the scraper and returns apiParsed directly without a genre merge
		spyOn(helper.apiHelper, 'fetchBook').mockImplementation(() =>
			Promise.resolve(deepCopy(mockApiResponse))
		)
	})

	test('resolves missing ASINs uniquely and never overwrites present ASINs', async () => {
		const parsed = deepCopy(parsedBook)
		parsed.authors[0].asin = undefined
		parsed.authors[0].name = 'Jason  Anspach'
		spyOn(helper.apiHelper, 'parseResponse').mockImplementation(() =>
			Promise.resolve(parsed)
		)

		const processed = await helper.process()
		// Uniquely-resolved ASIN survives into the returned ApiBook
		expect(processed.authors[0]).toEqual({ asin: 'B012DQ3BCM', name: 'Jason  Anspach' })
		// Present ASIN is never overwritten
		expect(processed.authors[1].asin).toBe('B004W47QXE')
	})

	test('sets authorCandidates for ambiguous names', async () => {
		const parsed = deepCopy(parsedBook)
		parsed.authors = [{ name: 'Ambiguous Author' }]
		spyOn(helper.apiHelper, 'parseResponse').mockImplementation(() =>
			Promise.resolve(parsed)
		)

		const processed = await helper.process()
		expect(processed.authors[0]).toEqual({
			name: 'Ambiguous Author',
			authorCandidates: ['B00000000X', 'B00000000Y']
		})
	})

	test('leaves not-found authors unchanged', async () => {
		const parsed = deepCopy(parsedBook)
		parsed.authors = [{ name: 'Unknown Person' }]
		spyOn(helper.apiHelper, 'parseResponse').mockImplementation(() =>
			Promise.resolve(parsed)
		)

		const processed = await helper.process()
		expect(processed.authors[0]).toEqual({ name: 'Unknown Person' })
	})

	test('enrichment failure never fails the scrape', async () => {
		mockAuthorResolve.mockRejectedValue(new Error('index exploded'))
		const parsed = deepCopy(parsedBook)
		parsed.authors[0].asin = undefined
		spyOn(helper.apiHelper, 'parseResponse').mockImplementation(() =>
			Promise.resolve(parsed)
		)

		const processed = await helper.process()
		expect(mockAuthorResolve).toHaveBeenCalled()
		// Author is left unchanged and the book is still returned
		expect(processed.authors[0].name).toBe('Jason Anspach')
		expect(processed.authors[0].asin).toBeUndefined()
	})

	test('applies out-of-order resolutions in the original author order', async () => {
		// Resolutions are gated so they complete in reverse request
		// order: results must be applied by original author index, not
		// by completion order.
		const results = new Map<string, unknown>([
			['alpha author', { asin: 'B0ALPHA' }],
			['beta author', { asin: 'B0BETA' }]
		])
		const resolvers = new Map<string, (value: unknown) => void>()
		const allStarted = Promise.withResolvers<void>()
		let startedCount = 0
		mockAuthorResolve.mockImplementation((name: string) => {
			startedCount += 1
			if (startedCount === results.size) {
				allStarted.resolve()
			}
			const { promise, resolve } = Promise.withResolvers<unknown>()
			resolvers.set(name, resolve)
			return promise
		})
		const parsed = deepCopy(parsedBook)
		parsed.authors = [{ name: 'alpha author' }, { name: 'beta author' }]
		spyOn(helper.apiHelper, 'parseResponse').mockImplementation(() =>
			Promise.resolve(parsed)
		)

		const processPromise = helper.process()
		// Both resolve() calls have started; complete in reverse order
		await allStarted.promise
		resolvers.get('beta author')!(results.get('beta author'))
		resolvers.get('alpha author')!(results.get('alpha author'))
		const processed = await processPromise
		expect(processed.authors[0]).toEqual({ asin: 'B0ALPHA', name: 'alpha author' })
		expect(processed.authors[1]).toEqual({ asin: 'B0BETA', name: 'beta author' })
	})

	test('only resolves authors missing an ASIN', async () => {
		const parsed = deepCopy(parsedBook)
		parsed.authors = [
			{ asin: 'B04W47QXE', name: 'Present Author' },
			{ name: 'Jason  Anspach' }
		]
		spyOn(helper.apiHelper, 'parseResponse').mockImplementation(() =>
			Promise.resolve(parsed)
		)

		const processed = await helper.process()
		expect(mockAuthorResolve).toHaveBeenCalledTimes(1)
		expect(mockAuthorResolve).toHaveBeenCalledWith('Jason  Anspach')
		expect(processed.authors[0]).toEqual({ asin: 'B04W47QXE', name: 'Present Author' })
		expect(processed.authors[1]).toEqual({ asin: 'B012DQ3BCM', name: 'Jason  Anspach' })
	})

	test('a rejected resolution leaves later authors unmodified', async () => {
		mockAuthorResolve.mockImplementation(async (name: string) => {
			if (name === 'exploding author') {
				throw new Error('index exploded')
			}
			return { asin: 'B0FINE' }
		})
		const parsed = deepCopy(parsedBook)
		parsed.authors = [{ name: 'exploding author' }, { name: 'fine author' }]
		spyOn(helper.apiHelper, 'parseResponse').mockImplementation(() =>
			Promise.resolve(parsed)
		)

		const processed = await helper.process()
		// The entire enrichment step is skipped on rejection: neither
		// author is mutated and the book is still returned
		expect(processed.authors[0]).toEqual({ name: 'exploding author' })
		expect(processed.authors[1]).toEqual({ name: 'fine author' })
	})

	test('skips enrichment entirely when the index is not ready', async () => {
		const parsed = deepCopy(parsedBook)
		parsed.authors[0].asin = undefined
		parsed.authors[0].name = 'Jason  Anspach'
		spyOn(helper.apiHelper, 'parseResponse').mockImplementation(() =>
			Promise.resolve(parsed)
		)
		// The mocked module object is shared: swap the predicate and restore
		const realIsReady = authorNameIndex.isReady
		authorNameIndex.isReady = () => false
		let processed: ApiBook
		try {
			processed = await helper.process()
		} finally {
			authorNameIndex.isReady = realIsReady
		}
		expect(mockAuthorResolve).not.toHaveBeenCalled()
		// Book returned unchanged: the missing ASIN was never filled in
		expect(processed.authors[0]).toEqual({ name: 'Jason  Anspach' })
		expect(processed.authors[1].asin).toBe('B004W47QXE')
	})

	test('preserves authorCandidates when merging scraper genres', async () => {
		const parsed = deepCopy(parsedBook)
		// JSON round-trip degrades the Date; restore it so the merged book's
		// ApiBookSchema revalidation succeeds
		parsed.releaseDate = parsedBook.releaseDate
		parsed.authors = [{ name: 'Ambiguous Author' }]
		spyOn(helper.apiHelper, 'parseResponse').mockImplementation(() =>
			Promise.resolve(parsed)
		)
		// Empty category_ladders forces the scraper path and the genre merge
		const apiResponseWithoutLadders = deepCopy(mockApiResponse)
		apiResponseWithoutLadders.product.category_ladders = []
		spyOn(helper.apiHelper, 'fetchBook').mockImplementation(() =>
			Promise.resolve(apiResponseWithoutLadders)
		)
		spyOn(helper.scrapeHelper, 'fetchBook').mockImplementation(() =>
			Promise.resolve(mockHTMLResponse)
		)
		spyOn(helper.scrapeHelper, 'parseResponse').mockImplementation(() =>
			Promise.resolve(genresObject)
		)

		const processed = await helper.process()
		// Both the enrichment (authorCandidates) and the genre merge survive
		// ApiBookSchema's revalidation of the merged book
		expect(processed.authors[0]).toEqual({
			name: 'Ambiguous Author',
			authorCandidates: ['B00000000X', 'B00000000Y']
		})
		expect(processed.genres).toEqual(genresObject.genres)
	})
})

afterAll(() => {
	mock.restore()
})
