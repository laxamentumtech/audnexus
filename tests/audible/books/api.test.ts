import type { ApiBook, AudibleProduct } from '#config/types'
import ApiHelper from '#helpers/books/audible/ApiHelper'
import type { MinimalResponse } from '#tests/datasets/audible/books/api'
import {
	B08C6YJ1LS,
	B017V4IM1G,
	minimalB08C6YJ1LS,
	minimalB08G9PRS1K,
	setupMinimalParsed,
	setupMinimalResponse
} from '#tests/datasets/audible/books/api'
import {
	B08C6YJ1LScopyright,
	B08C6YJ1LSdescription,
	B08C6YJ1LSimage,
	B017V4IM1Gcopyright,
	B017V4IM1Gdescription,
	B017V4IM1Gimage
} from '#tests/datasets/audible/books/stitch'

let asin: string
let helper: ApiHelper
let minimalResponse: MinimalResponse
let minimalParsed: ApiBook

describe('Audible API', () => {
	describe('When fetching Project Hail Mary', () => {
		let response: AudibleProduct['product']
		beforeAll(async () => {
			asin = 'B08G9PRS1K'
			helper = new ApiHelper(asin, 'us')
			const fetched = await helper.fetchBook()
			response = fetched.product
			// Make an object with the same keys as the response
			minimalResponse = setupMinimalResponse(response)
		}, 10000)

		it('returned the correct data', () => {
			expect(minimalResponse).toEqual(minimalB08G9PRS1K)
		})
	})

	describe('When fetching The Coldest Case', () => {
		let response: AudibleProduct['product']
		beforeAll(async () => {
			asin = 'B08C6YJ1LS'
			helper = new ApiHelper(asin, 'us')
			const fetched = await helper.fetchBook()
			response = fetched.product
			// Make an object with the same keys as the response
			minimalResponse = setupMinimalResponse(response)
		}, 10000)

		it('returned the correct data', () => {
			expect(minimalResponse).toEqual(minimalB08C6YJ1LS)
		})
	})

	describe('When parsing The Coldest Case', () => {
		let response: ApiBook
		beforeAll(async () => {
			asin = 'B08C6YJ1LS'
			helper = new ApiHelper(asin, 'us')
			const fetched = await helper.fetchBook()
			const parsed = await helper.parseResponse(fetched)
			if (!parsed.genres) throw new Error('Parsed is undefined')
			response = parsed
			// Make an object with the same keys as the response
			minimalParsed = setupMinimalParsed(
				B08C6YJ1LS.product,
				B08C6YJ1LScopyright,
				B08C6YJ1LSdescription,
				B08C6YJ1LSimage,
				parsed.genres
			)
		}, 10000)

		it('returned the correct data', () => {
			expect(response).toEqual(minimalParsed)
		})
	})

	describe('When parsing Scorcerers Stone', () => {
		let response: ApiBook
		beforeAll(async () => {
			asin = 'B017V4IM1G'
			helper = new ApiHelper(asin, 'us')
			const fetched = await helper.fetchBook()
			const parsed = await helper.parseResponse(fetched)
			if (!parsed.genres) throw new Error('Parsed is undefined')
			response = parsed
			// Make an object with the same keys as the response
			minimalParsed = setupMinimalParsed(
				B017V4IM1G.product,
				B017V4IM1Gcopyright,
				B017V4IM1Gdescription,
				B017V4IM1Gimage,
				parsed.genres
			)
		}, 10000)

		it('returned the correct data', () => {
			expect(response).toEqual(minimalParsed)
		})
	})
})
