import type { AxiosResponse } from 'axios'

import { ApiBook } from '#config/typing/books'
import SeedHelper from '#helpers/authors/audible/SeedHelper'
import * as fetchPlus from '#helpers/utils/fetchPlus'
import { parsedBook } from '#tests/datasets/helpers/books'

jest.mock('#helpers/utils/fetchPlus')

let helper: SeedHelper
let mockResponse: ApiBook
const deepCopy = (obj: unknown) => JSON.parse(JSON.stringify(obj))

beforeEach(() => {
	// Variables
	mockResponse = deepCopy(parsedBook)
	jest
		.spyOn(fetchPlus, 'default')
		.mockImplementation(() => Promise.resolve({ status: 200 } as AxiosResponse))
	// Set up helpers
	helper = new SeedHelper(mockResponse)
})

describe('SeedHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.book).toBe(mockResponse)
	})

	test('seed all', async () => {
		const seedAll = await helper.seedAll()
		expect(seedAll).toEqual([true, true])
	})

	test('return false when no author asin', async () => {
		helper.book.authors[0].asin = undefined
		const seedAll = await helper.seedAll()
		expect(seedAll).toEqual([false, true])
	})

	test('log error if http error', async () => {
		jest.spyOn(fetchPlus, 'default').mockImplementation(() => Promise.reject({ status: 400 }))
		await expect(helper.seedAll()).resolves.toEqual([false, false])
	})

	test('return false if no author asin', async () => {
		helper.book.authors = []
		await expect(helper.seedAll()).resolves.toEqual([])
	})
})
