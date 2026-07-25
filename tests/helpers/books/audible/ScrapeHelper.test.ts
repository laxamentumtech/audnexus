/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { AxiosResponse } from 'axios'
import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import * as cheerio from 'cheerio'
import type { FastifyBaseLogger } from 'fastify'

import ScrapeHelper from '#helpers/books/audible/ScrapeHelper'
import * as fetchPlus from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'
import { genresObject, htmlResponse } from '#tests/datasets/helpers/books'

mock.module('#helpers/utils/fetchPlus', () => {
	return { default: mock() }
})

mock.module('#helpers/utils/shared', () => {
	return {
		default: class SharedHelper {
			buildUrl() {
				return ''
			}
			collectGenres() {
				return []
			}
			getGenresFromHtml() {
				return []
			}
		}
	}
})

let asin: string
let helper: ScrapeHelper
let mockResponse: string
let region: string
let url: string
const deepCopy = (obj: unknown) => JSON.parse(JSON.stringify(obj))

beforeEach(() => {
	asin = 'B079LRSMNN'
	region = 'us'
	url = `https://www.audible.com/pd/${asin}/`
	mockResponse = deepCopy(htmlResponse)
	spyOn(SharedHelper.prototype, 'buildUrl').mockReturnValue(url)
	spyOn(fetchPlus, 'default').mockImplementation(() =>
		Promise.resolve({ data: mockResponse, status: 200 } as AxiosResponse)
	)
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

	test('log no error message on 404 response', async () => {
		mock.restore()
		const mockLogger = { info: mock() }
		spyOn(fetchPlus, 'default').mockImplementationOnce(() => { const e: Error & { status: number } = Object.assign(new Error(), { status: 404 }); return Promise.reject(e) })
		helper = new ScrapeHelper(asin, region, mockLogger as unknown as FastifyBaseLogger)
		await expect(helper.fetchBook()).resolves.toBeUndefined()
		expect(mockLogger.info).not.toHaveBeenCalled()
	})

	test('return error if no book', async () => {
		asin = asin.slice(0, -1)
		helper = new ScrapeHelper(asin, region)
		mock.restore()
		spyOn(fetchPlus, 'default').mockImplementationOnce(() => { const e: Error & { status: number } = Object.assign(new Error(), { status: 404 }); return Promise.reject(e) })
		await expect(helper.fetchBook()).resolves.toBeUndefined()
	})

	test('parse response', async () => {
		spyOn(SharedHelper.prototype, 'collectGenres').mockReturnValueOnce([genresObject.genres[0]])
		spyOn(SharedHelper.prototype, 'collectGenres').mockReturnValueOnce([genresObject.genres[1]])
		const book = await helper.fetchBook()
		await expect(helper.parseResponse(book)).resolves.toEqual(genresObject)
	})

	test('return undefined if no dom for parse response', async () => {
		await expect(helper.parseResponse(undefined)).resolves.toBeUndefined()
	})

	test('return undefined if no genres', async () => {
		spyOn(SharedHelper.prototype, 'collectGenres').mockReturnValue([])
		await expect(helper.parseResponse(cheerio.load(''))).resolves.toBeUndefined()
	})

	test('log non-404 status code', async () => {
		mock.restore()
		const mockLogger = { info: mock() }
		spyOn(fetchPlus, 'default').mockImplementationOnce(() => { const e: Error & { status: number } = Object.assign(new Error(), { status: 500 }); return Promise.reject(e) })
		helper = new ScrapeHelper(asin, region, mockLogger as unknown as FastifyBaseLogger)
		await expect(helper.fetchBook()).resolves.toBeUndefined()
		expect(mockLogger.info).toHaveBeenCalledWith(
			'An error occured while fetching data from HTML. Response: 500, ASIN: B079LRSMNN'
		)
	})
})
afterAll(() => {
	mock.restore()
})
