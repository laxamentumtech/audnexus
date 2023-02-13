import type { AxiosResponse } from 'axios'
import * as cheerio from 'cheerio'

import ScrapeHelper from '#helpers/authors/audible/ScrapeHelper'
import * as fetchPlus from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'
import { regions } from '#static/regions'
import {
	htmlResponse,
	htmlResponseNameOnly,
	htmlResponseNoData
} from '#tests/datasets/audible/authors/scrape'
import { genres, parsedAuthor } from '#tests/datasets/helpers/authors'

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
	asin = 'B012DQ3BCM'
	region = 'us'
	url = `https://www.audible.com/author/${asin}/`
	mockResponse = deepCopy(htmlResponse)
	// Set up spys
	jest.spyOn(SharedHelper.prototype, 'buildUrl').mockReturnValue(url)
	jest.spyOn(SharedHelper.prototype, 'collectGenres').mockReturnValue(genres)
	// Set up helpers
	helper = new ScrapeHelper(asin, region)
})

describe('ScrapeHelper should', () => {
	beforeEach(() => {
		jest
			.spyOn(fetchPlus, 'default')
			.mockImplementation(() =>
				Promise.resolve({ data: mockResponse, status: 200 } as AxiosResponse)
			)
	})
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.reqUrl).toBe(url)
	})

	test('fetch author', async () => {
		const author = await helper.fetchAuthor()
		expect(author.html()).toEqual(cheerio.load(htmlResponse).html())
	})

	test('parse response', async () => {
		const author = await helper.fetchAuthor()
		await expect(helper.parseResponse(author)).resolves.toEqual(parsedAuthor)
	})

	test('return undefined if no dom for parse response', async () => {
		await expect(helper.parseResponse(undefined)).rejects.toThrow('No response from HTML')
	})

	test('process author', async () => {
		await expect(helper.process()).resolves.toEqual(parsedAuthor)
	})

	test('return a name when author has no bio, genres or image', async () => {
		jest.spyOn(SharedHelper.prototype, 'collectGenres').mockReturnValue([])
		const html = cheerio.load(htmlResponseNameOnly)
		await expect(helper.parseResponse(html)).resolves.toEqual({
			asin: 'B012DQ3BCM',
			description: '',
			genres: [],
			image: '',
			name: 'Jason Anspach',
			region: region
		})
	})

	describe('handle region: ', () => {
		test.each(Object.keys(regions))('%s', async (region) => {
			helper = new ScrapeHelper('B079LRSMNN', region)
			const data = await helper.process()
			expect(data.region).toEqual(region)
		})
	})
})

describe('ScrapeHelper should throw error when', () => {
	test('no author', async () => {
		asin = asin.slice(0, -1)
		helper = new ScrapeHelper(asin, region)
		jest.restoreAllMocks()
		jest.spyOn(fetchPlus, 'default').mockImplementation(() =>
			Promise.reject({
				status: 404
			})
		)
		await expect(helper.fetchAuthor()).rejects.toThrow(
			`An error occured while fetching data from Audible HTML. Response: 404, ASIN: ${asin}`
		)
	})
	test('author has no name', async () => {
		const html = cheerio.load(htmlResponseNoData)
		expect(helper.parseResponse(html)).rejects.toThrowError(
			`No author name found for ASIN: ${asin}`
		)
	})

	test('parse response fails validation', async () => {
		jest.spyOn(helper, 'getName').mockReturnValue('')
		await expect(helper.parseResponse(cheerio.load(htmlResponse))).rejects.toThrowError(
			`Item not available in region '${region}' for ASIN: ${asin}`
		)
	})
})
