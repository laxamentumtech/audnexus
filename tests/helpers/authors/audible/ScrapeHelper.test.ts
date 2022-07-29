import ScrapeHelper from '#helpers/authors/audible/ScrapeHelper'
import { parsedAuthor } from '#tests/datasets/helpers/authors'

let helper: ScrapeHelper

beforeEach(() => {
	// Set up helpers
	helper = new ScrapeHelper('B012DQ3BCM')
})

test('should setup constructor correctly', () => {
	expect(helper.asin).toBe('B012DQ3BCM')
	expect(helper.reqUrl).toBe('https://www.audible.com/author/B012DQ3BCM/')
})

test.todo('should return undefined if no genres')

test('should fetch author', async () => {
	await expect(helper.fetchAuthor()).resolves.toBeDefined()
})

test('should return error if no author', async () => {
	helper = new ScrapeHelper('B012DQ3BC')

	await expect(helper.fetchAuthor()).rejects.toThrow(
		'An error occured while fetching Audible HTML. Response: 404, ASIN: B012DQ3BC'
	)
})

test('should parse response', async () => {
	const author = await helper.fetchAuthor()
	await expect(helper.parseResponse(author)).resolves.toEqual(parsedAuthor)
})

test('should return undefined if no dom for parse response', async () => {
	await expect(helper.parseResponse(undefined)).rejects.toThrow('No response from HTML')
})

test.todo('should throw error if no name')
test.todo('should debug if no bio or genres')

test('should process author', async () => {
	await expect(helper.process()).resolves.toEqual(parsedAuthor)
})
