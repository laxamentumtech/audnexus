import SeedHelper from '#helpers/authors/audible/SeedHelper'
import { parsedBook } from '#tests/datasets/helpers/books'

let helper: SeedHelper

beforeEach(() => {
	// Set up helpers
	helper = new SeedHelper(parsedBook)
})

describe('SeedHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.book).toBe(parsedBook)
	})

	test('seed all', async () => {
		// Mock Fetch
		global.fetch = jest.fn().mockImplementation(() =>
			Promise.resolve({
				status: 200,
				ok: true
			})
		)
		const seedAll = await helper.seedAll()
		expect(seedAll).toEqual([true, true])
		expect(fetch).toHaveBeenCalledTimes(2)
	})

	test('return false when no author asin', async () => {
		// Mock Fetch
		global.fetch = jest.fn().mockImplementation(() =>
			Promise.resolve({
				status: 200,
				ok: true
			})
		)
		helper.book.authors[0].asin = undefined
		const seedAll = await helper.seedAll()
		expect(seedAll).toEqual([false, true])
		expect(fetch).toHaveBeenCalledTimes(1)
	})

	test('log error if http error', async () => {
		// Mock Fetch
		global.fetch = jest.fn().mockImplementation(() =>
			Promise.reject({
				status: 400,
				ok: false
			})
		)
		await expect(helper.seedAll()).resolves.toBeUndefined()
	})

	test('return false if no author asin', async () => {
		helper.book.authors = []
		await expect(helper.seedAll()).resolves.toEqual([])
	})
})
