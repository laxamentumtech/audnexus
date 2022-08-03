import ScrapeHelper from '#helpers/books/audible/ScrapeHelper'
import { genresObject } from '#tests/datasets/helpers/books'

let helper: ScrapeHelper

beforeEach(() => {
	// Set up helpers
	helper = new ScrapeHelper('B079LRSMNN')
})

describe('ScrapeHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe('B079LRSMNN')
		expect(helper.reqUrl).toBe('https://www.audible.com/pd/B079LRSMNN/')
	})

	test('fetch book', async () => {
		await expect(helper.fetchBook()).resolves.toBeDefined()
	})

	test.todo('log error message if no book found')

	test('return error if no book', async () => {
		helper = new ScrapeHelper('B079LRSMN')

		await expect(helper.fetchBook()).resolves.toBeUndefined()
	})

	test('parse response', async () => {
		const book = await helper.fetchBook()
		await expect(helper.parseResponse(book)).resolves.toEqual(genresObject)
	})

	test('return undefined if no dom for parse response', async () => {
		await expect(helper.parseResponse(undefined)).resolves.toBeUndefined()
	})

	test.todo("return undefined if genres don't have asin")
})
