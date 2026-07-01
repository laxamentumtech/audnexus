import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test'

import BookSearchApiHelper from '#helpers/books/audible/BookSearchApiHelper'

const mockFetch = mock()

mock.module('#helpers/utils/fetchPlus', () => ({ default: mockFetch }))

const mockGetFinalData = mock()

mock.module('#helpers/books/audible/ApiHelper', () => ({
	default: class MockApiHelper {
		audibleResponse: unknown
		getFinalData = mockGetFinalData
	}
}))

const mockLogger = {
	error: mock(),
	info: mock(),
	debug: mock(),
	warn: mock()
}

const minimalProduct = {
	asin: 'B08V8B2CGV',
	title: 'Dungeon Crawler Carl',
	authors: [{ name: 'Matt Dinniman', asin: 'B002BLP1QY' }]
}

const minimalBook = {
	asin: 'B08V8B2CGV',
	title: 'Dungeon Crawler Carl',
	authors: [{ name: 'Matt Dinniman', asin: 'B002BLP1QY' }]
}

describe('BookSearchApiHelper', () => {
	beforeEach(() => {
		mockFetch.mockReset()
		mockGetFinalData.mockReset()
	})

	describe('constructor', () => {
		it('builds correct URL for us region', () => {
			const helper = new BookSearchApiHelper('dungeon crawler carl', 'us', mockLogger)
			expect(helper.requestUrl).toContain('https://api.audible.com/1.0/catalog/products')
			expect(helper.requestUrl).toContain('keywords=dungeon%20crawler%20carl')
			expect(helper.requestUrl).toContain('num_results=10')
		})

		it('uses correct TLD for non-us region', () => {
			const helper = new BookSearchApiHelper('test', 'uk', mockLogger)
			expect(helper.requestUrl).toContain('api.audible.co.uk')
		})

		it('URL-encodes the query', () => {
			const helper = new BookSearchApiHelper('harry & the potter', 'us', mockLogger)
			expect(helper.requestUrl).toContain('harry%20%26%20the%20potter')
			expect(helper.requestUrl).not.toContain('harry & the potter')
		})
	})

	describe('parseResults', () => {
		it('returns empty array when no products', async () => {
			mockFetch.mockResolvedValue({ data: { products: [] } })
			const helper = new BookSearchApiHelper('nothing', 'us', mockLogger)
			expect(await helper.parseResults()).toEqual([])
		})

		it('returns empty array when products is undefined', async () => {
			mockFetch.mockResolvedValue({ data: {} })
			const helper = new BookSearchApiHelper('nothing', 'us', mockLogger)
			expect(await helper.parseResults()).toEqual([])
		})

		it('returns parsed books for valid products', async () => {
			mockFetch.mockResolvedValue({ data: { products: [minimalProduct] } })
			mockGetFinalData.mockResolvedValue(minimalBook)
			const helper = new BookSearchApiHelper('dungeon crawler carl', 'us', mockLogger)
			const results = await helper.parseResults()
			expect(results).toHaveLength(1)
			expect(results[0]).toEqual(minimalBook)
		})

		it('skips products where getFinalData rejects', async () => {
			const goodProduct = { ...minimalProduct, asin: 'GOOD1234' }
			const badProduct = { ...minimalProduct, asin: 'BAD12345' }
			mockFetch.mockResolvedValue({ data: { products: [goodProduct, badProduct] } })
			mockGetFinalData
				.mockResolvedValueOnce(minimalBook)
				.mockRejectedValueOnce(new Error('parse failed'))
			const helper = new BookSearchApiHelper('dungeon crawler carl', 'us', mockLogger)
			const results = await helper.parseResults()
			expect(results).toHaveLength(1)
		})

		it('logs a warning for each rejected product', async () => {
			mockFetch.mockResolvedValue({ data: { products: [minimalProduct] } })
			mockGetFinalData.mockRejectedValue(new Error('parse failed'))
			const helper = new BookSearchApiHelper('dungeon crawler carl', 'us', mockLogger)
			await helper.parseResults()
			expect(mockLogger.warn).toHaveBeenCalled()
		})

		it('throws with structured message on fetch error', async () => {
			mockFetch.mockRejectedValue({ status: 403 })
			const helper = new BookSearchApiHelper('dungeon crawler carl', 'us', mockLogger)
			await expect(helper.parseResults()).rejects.toThrow()
		})
	})
})

afterAll(() => {
	mock.restore()
})
