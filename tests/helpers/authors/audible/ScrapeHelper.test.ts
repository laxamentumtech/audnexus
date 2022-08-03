import ScrapeHelper from '#helpers/authors/audible/ScrapeHelper'
import { parsedAuthor } from '#tests/datasets/helpers/authors'

let helper: ScrapeHelper

beforeEach(() => {
	// Set up helpers
	helper = new ScrapeHelper('B012DQ3BCM')
})

describe('ScrapeHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe('B012DQ3BCM')
		expect(helper.reqUrl).toBe('https://www.audible.com/author/B012DQ3BCM/')
	})

	test.todo('return undefined if no genres')

	test('fetch author', async () => {
		await expect(helper.fetchAuthor()).resolves.toBeDefined()
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
})

describe('ScrapeHelper should throw error when', () => {
	test('no author', async () => {
		helper = new ScrapeHelper('B012DQ3BC')

		await expect(helper.fetchAuthor()).rejects.toThrow(
			'An error occured while fetching Audible HTML. Response: 404, ASIN: B012DQ3BC'
		)
	})
	test.todo('author has no name')
	test.todo('author has no bio or genres')
})
