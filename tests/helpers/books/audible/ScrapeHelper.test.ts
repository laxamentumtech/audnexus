import ScrapeHelper from '#helpers/books/audible/ScrapeHelper'
import { genresObject } from '#tests/datasets/helpers/books'

let helper: ScrapeHelper

beforeEach(() => {
	// Set up helpers
	helper = new ScrapeHelper('B079LRSMNN')
})

test('should setup constructor correctly', () => {
	expect(helper.asin).toBe('B079LRSMNN')
	expect(helper.reqUrl).toBe('https://www.audible.com/pd/B079LRSMNN/')
})

test('should fetch book', async () => {
	await expect(helper.fetchBook()).resolves.toBeDefined()
})

test.todo('should log error message if no book found')

test('should return error if no book', async () => {
	helper = new ScrapeHelper('B079LRSMN')

	await expect(helper.fetchBook()).resolves.toBeUndefined()
})

test('should parse response', async () => {
	const book = await helper.fetchBook()
	await expect(helper.parseResponse(book)).resolves.toEqual(genresObject)
})

test('should return undefined if no dom for parse response', async () => {
	await expect(helper.parseResponse(undefined)).resolves.toBeUndefined()
})

test.todo("should return undefined if genres don't have asin")
