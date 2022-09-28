import * as cheerio from 'cheerio'

import ScrapeHelper from '#helpers/authors/audible/ScrapeHelper'
import {
	htmlResponse,
	htmlResponseNameOnly,
	htmlResponseNoData
} from '#tests/datasets/audible/authors/scrape'
import { parsedAuthor } from '#tests/datasets/helpers/authors'

let asin: string
let helper: ScrapeHelper

beforeEach(() => {
	// Set up helpers
	asin = 'B012DQ3BCM'
	helper = new ScrapeHelper(asin, 'us')
})

describe('ScrapeHelper should', () => {
	beforeEach(() => {
		jest
			.spyOn(global, 'fetch')
			.mockImplementationOnce(() =>
				Promise.resolve({ ok: true, status: 200, text: () => htmlResponse } as unknown as Response)
			)
	})
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.reqUrl).toBe('https://www.audible.com/author/B012DQ3BCM/')
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
		const html = cheerio.load(htmlResponseNameOnly)
		await expect(helper.parseResponse(html)).resolves.toEqual({
			asin: 'B012DQ3BCM',
			description: '',
			genres: [],
			image: '',
			name: 'Jason Anspach',
			region: 'us'
		})
	})
})

describe('ScrapeHelper should throw error when', () => {
	test('no author', async () => {
		asin = asin.slice(0, -1)
		helper = new ScrapeHelper(asin, 'us')
		jest.restoreAllMocks()
		jest
			.spyOn(global, 'fetch')
			.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 404 } as Response))
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
})
