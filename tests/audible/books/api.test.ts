import type { ApiBook, AudibleProduct, Book } from '#config/types'
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

let asin: string
let helper: ApiHelper
let minimalResponse: MinimalResponse
let minimalParsed: Book

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
		})

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
		})

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
			const description =
				"James Patterson's Detective Billy Harney is back, this time investigating murders in a notorious Chicago drug ring, which will lead him, his sister, and his new partner through a dangerous web of corrupt politicians, vengeful billionaires, and violent dark web conspiracies...."
			const image = 'https://m.media-amazon.com/images/I/91H9ynKGNwL.jpg'
			minimalParsed = setupMinimalParsed(B08C6YJ1LS.product, description, image, parsed.genres)
		})

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
			const description =
				'Harry Potter has never even heard of Hogwarts when the letters start dropping on the doormat at number four, Privet Drive. Addressed in green ink on yellowish parchment with a purple seal, they are swiftly confiscated by his grisly aunt and uncle....'
			const image = 'https://m.media-amazon.com/images/I/91eopoUCjLL.jpg'
			minimalParsed = setupMinimalParsed(B017V4IM1G.product, description, image, parsed.genres)
		})

		it('returned the correct data', () => {
			expect(response).toEqual(minimalParsed)
		})
	})
})
