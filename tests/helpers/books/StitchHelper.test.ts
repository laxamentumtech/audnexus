import { parsedBookWithGenres } from '../../datasets/helpers/books'

import ApiHelper from '#helpers/books/audible/ApiHelper'
import ScrapeHelper from '#helpers/books/audible/ScrapeHelper'
import StitchHelper from '#helpers/books/audible/StitchHelper'

let helper: StitchHelper

beforeEach(() => {
	// Set up helpers
	helper = new StitchHelper('B079LRSMNN')
})

test('should setup constructor correctly', () => {
	expect(helper.asin).toBe('B079LRSMNN')
	expect(helper.apiHelper).toBeInstanceOf(ApiHelper)
	expect(helper.scrapeHelper).toBeInstanceOf(ScrapeHelper)
})

test('should fetch sources', async () => {
	await helper.fetchSources()
	expect(helper.apiResponse).toBeDefined()
	expect(helper.scraperResponse).toBeDefined()
})

test('should parse responses', async () => {
	await helper.fetchSources()
	await helper.parseResponses()
	expect(helper.apiParsed).toBeDefined()
	expect(helper.scraperParsed).toBeDefined()
})

test('should include genres if genres exist', async () => {
	await helper.fetchSources()
	await helper.parseResponses()
	await expect(helper.includeGenres()).resolves.toEqual(parsedBookWithGenres)
})

test('should process book', async () => {
	const proccessed = await helper.process()

	expect(proccessed).toEqual(parsedBookWithGenres)
	expect(helper.apiResponse).toBeDefined()
	expect(helper.scraperResponse).toBeDefined()
	expect(helper.apiParsed).toBeDefined()
	expect(helper.scraperParsed).toBeDefined()
})
