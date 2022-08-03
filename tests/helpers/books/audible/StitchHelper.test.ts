import ApiHelper from '#helpers/books/audible/ApiHelper'
import ScrapeHelper from '#helpers/books/audible/ScrapeHelper'
import StitchHelper from '#helpers/books/audible/StitchHelper'
import { parsedBookWithGenres } from '#tests/datasets/helpers/books'

let asin: string
let helper: StitchHelper

beforeEach(() => {
	asin = 'B079LRSMNN'
	// Set up helpers
	helper = new StitchHelper(asin)
})

describe('StitchHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.apiHelper).toBeInstanceOf(ApiHelper)
		expect(helper.scrapeHelper).toBeInstanceOf(ScrapeHelper)
	})

	test('fetch sources', async () => {
		await helper.fetchSources()
		expect(helper.apiResponse).toBeDefined()
		expect(helper.scraperResponse).toBeDefined()
	})

	test('parse responses', async () => {
		await helper.fetchSources()
		await helper.parseResponses()
		expect(helper.apiParsed).toBeDefined()
		expect(helper.scraperParsed).toBeDefined()
	})

	test('include genres if genres exist', async () => {
		await helper.fetchSources()
		await helper.parseResponses()
		await expect(helper.includeGenres()).resolves.toEqual(parsedBookWithGenres)
	})

	test('process book', async () => {
		const proccessed = await helper.process()

		expect(proccessed).toEqual(parsedBookWithGenres)
		expect(helper.apiResponse).toBeDefined()
		expect(helper.scraperResponse).toBeDefined()
		expect(helper.apiParsed).toBeDefined()
		expect(helper.scraperParsed).toBeDefined()
	})
})
