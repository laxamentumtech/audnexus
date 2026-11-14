import { beforeEach, describe, expect, mock, test } from 'bun:test'

import { AudibleProduct } from '#config/types'
import { fetchProductsByAsin } from '#helpers/books/audible/ApiBatchHelper'
import * as fetchPlus from '#helpers/utils/fetchPlus'
import { apiResponse } from '#tests/datasets/helpers/books'

mock.module('#helpers/utils/fetchPlus', () => {
	return { default: mock() }
})

interface MockFetch {
	(url: string): Promise<unknown>
	mockReset(): void
	mockImplementation(fn: (url: string) => Promise<unknown>): void
	mock: { calls: unknown[][] }
}

const mockFetch = fetchPlus.default as unknown as MockFetch
const deepCopy = <T>(obj: T): T => JSON.parse(JSON.stringify(obj)) as T
const product = deepCopy((apiResponse as AudibleProduct).product)

/** Build a response for the ASINs in the request URL. */
function respond(url: string, extra: unknown[] = []) {
	const asins = new URL(url).searchParams.get('asins')?.split(',') ?? []
	return {
		data: {
			products: [
				...asins.map((asin) => ({ ...deepCopy(product), asin })),
				...extra
			],
			response_groups: ['rating', 'product_desc'],
			total_results: asins.length + extra.length
		}
	}
}

beforeEach(() => {
	mockFetch.mockReset()
})

describe('fetchProductsByAsin', () => {
	test('chunks at the 50-ASIN endpoint cap', async () => {
		mockFetch.mockImplementation(async (url: string) => respond(url))
		const asins = Array.from({ length: 51 }, (_, i) => `B${String(i).padStart(9, '0')}`)

		const result = await fetchProductsByAsin(asins, 'us')

		expect(mockFetch).toHaveBeenCalledTimes(2)
		const first = new URL(mockFetch.mock.calls[0][0] as string)
		const second = new URL(mockFetch.mock.calls[1][0] as string)
		expect(first.searchParams.get('asins')?.split(',')).toHaveLength(50)
		expect(second.searchParams.get('asins')?.split(',')).toHaveLength(1)
		expect(result.found.size).toBe(51)
	})

	test('deduplicates ASINs before requesting', async () => {
		mockFetch.mockImplementation(async (url: string) => respond(url))
		await fetchProductsByAsin(['B000000001', 'B000000001', 'B000000002'], 'us')
		expect(mockFetch).toHaveBeenCalledTimes(1)
		const asins = new URL(mockFetch.mock.calls[0][0] as string).searchParams.get('asins')
		expect(asins).toBe('B000000001,B000000002')
	})

	test('treats a bare { asin } stub as not found', async () => {
		mockFetch.mockImplementation(async (url: string) =>
			respond(url, [{ asin: 'INVALID999' }])
		)
		const result = await fetchProductsByAsin(['B000000001', 'INVALID999'], 'us')
		expect(result.found.has('B000000001')).toBe(true)
		expect(result.found.has('INVALID999')).toBe(false)
		expect(result.stubs.has('INVALID999')).toBe(true)
	})

	test('treats an unparseable product as a stub for per-book fallback', async () => {
		mockFetch.mockImplementation(async () => ({
			data: {
				products: [{ asin: 'BADPRODUCT', content_delivery_type: 'NotAType' }],
				response_groups: ['rating'],
				total_results: 1
			}
		}))
		const result = await fetchProductsByAsin(['BADPRODUCT'], 'us')
		expect(result.found.size).toBe(0)
		expect(result.stubs.has('BADPRODUCT')).toBe(true)
	})

	test('propagates transport errors for caller fallback', async () => {
		mockFetch.mockImplementation(async () => {
			throw new Error('503')
		})
		await expect(fetchProductsByAsin(['B000000001'], 'us')).rejects.toThrow('503')
	})

	test('passes the response groups through for history evidence', async () => {
		mockFetch.mockImplementation(async (url: string) => respond(url))
		const result = await fetchProductsByAsin(['B000000001'], 'us')
		expect(result.found.get('B000000001')?.responseGroups).toEqual([
			'rating',
			'product_desc'
		])
		expect(result.found.get('B000000001')?.receivedAt).toBeInstanceOf(Date)
	})
})
