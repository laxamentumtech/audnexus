import { AudibleProduct } from '#config/typing/audible'
import type { Book } from '#config/typing/books'
import { ApiBook } from '#config/typing/books'
import ApiHelper from '#helpers/books/audible/ApiHelper'
import type { MinimalResponse } from '#tests/datasets/audible/api'
import {
	B08C6YJ1LS,
	B017V4IM1G,
	minimalB08C6YJ1LS,
	minimalB08G9PRS1K
} from '#tests/datasets/audible/api'

let apiGood: ApiHelper
let minimalResponse: MinimalResponse
let minimalParsed: Book

// Live api testing
describe('When fetching Project Hail Mary from Audible API', () => {
	let response: AudibleProduct['product']
	beforeAll((done) => {
		apiGood = new ApiHelper('B08G9PRS1K')
		apiGood.fetchBook().then((result) => {
			if (!result) return undefined
			response = result.product
			// Make an object with the same keys as the response
			minimalResponse = {
				asin: response.asin,
				authors: response.authors,
				merchandising_summary: response.merchandising_summary,
				format_type: response.format_type,
				language: response.language,
				narrators: response.narrators,
				product_images: response.product_images,
				publisher_name: response.publisher_name,
				publisher_summary: response.publisher_summary,
				release_date: response.release_date,
				runtime_length_min: response.runtime_length_min,
				title: response.title
			}
			done()
		})
	})

	it('returned the correct data', () => {
		expect(minimalResponse).toEqual(minimalB08G9PRS1K)
	})
})

describe('When fetching The Coldest Case from Audible API', () => {
	let response: AudibleProduct['product']
	beforeAll((done) => {
		apiGood = new ApiHelper('B08C6YJ1LS')
		apiGood.fetchBook().then((result) => {
			if (!result) return undefined
			response = result.product
			// Make an object with the same keys as the response
			minimalResponse = {
				asin: response.asin,
				authors: response.authors,
				merchandising_summary: response.merchandising_summary,
				format_type: response.format_type,
				language: response.language,
				narrators: response.narrators,
				product_images: response.product_images,
				publisher_name: response.publisher_name,
				publisher_summary: response.publisher_summary,
				release_date: response.release_date,
				runtime_length_min: response.runtime_length_min,
				title: response.title
			}
			done()
		})
	})

	it('returned the correct data', () => {
		expect(minimalResponse).toEqual(minimalB08C6YJ1LS)
	})
})

describe('When parsing The Coldest Case', () => {
	let response: ApiBook
	beforeAll(async () => {
		apiGood = new ApiHelper('B08C6YJ1LS')
		const fetched = await apiGood.fetchBook()
		const parsed = await apiGood.parseResponse(fetched)
		response = parsed
		// Make an object with the same keys as the response
		minimalParsed = {
			asin: B08C6YJ1LS.product.asin,
			authors: B08C6YJ1LS.product.authors,
			description:
				"James Patterson's Detective Billy Harney is back, this time investigating murders in a notorious Chicago drug ring, which will lead him, his sister, and his new partner through a dangerous web of corrupt politicians, vengeful billionaires, and violent dark web conspiracies....",
			formatType: B08C6YJ1LS.product.format_type,
			language: B08C6YJ1LS.product.language,
			narrators: B08C6YJ1LS.product.narrators,
			image: 'https://m.media-amazon.com/images/I/91H9ynKGNwL.jpg',
			rating: B08C6YJ1LS.product.rating.overall_distribution.display_average_rating.toString(),
			publisherName: B08C6YJ1LS.product.publisher_name,
			summary: B08C6YJ1LS.product.publisher_summary,
			releaseDate: new Date(B08C6YJ1LS.product.release_date),
			runtimeLengthMin: B08C6YJ1LS.product.runtime_length_min,
			title: B08C6YJ1LS.product.title,
			seriesPrimary: {
				asin: B08C6YJ1LS.product.series[0].asin,
				name: B08C6YJ1LS.product.series[0].title,
				position: B08C6YJ1LS.product.series[0].sequence
			}
		}
	})

	it('returned the correct data', () => {
		expect(response).toEqual(minimalParsed)
	})
})

describe('When parsing Scorcerers Stone', () => {
	let response: ApiBook
	beforeAll(async () => {
		apiGood = new ApiHelper('B017V4IM1G')
		const fetched = await apiGood.fetchBook()
		const parsed = await apiGood.parseResponse(fetched)
		response = parsed
		// Make an object with the same keys as the response
		minimalParsed = {
			asin: B017V4IM1G.product.asin,
			authors: B017V4IM1G.product.authors,
			description:
				'Harry Potter has never even heard of Hogwarts when the letters start dropping on the doormat at number four, Privet Drive. Addressed in green ink on yellowish parchment with a purple seal, they are swiftly confiscated by his grisly aunt and uncle....',
			formatType: B017V4IM1G.product.format_type,
			language: B017V4IM1G.product.language,
			narrators: B017V4IM1G.product.narrators,
			image: 'https://m.media-amazon.com/images/I/91eopoUCjLL.jpg',
			rating: B017V4IM1G.product.rating.overall_distribution.display_average_rating.toString(),
			publisherName: B017V4IM1G.product.publisher_name,
			summary: B017V4IM1G.product.publisher_summary,
			releaseDate: new Date(B017V4IM1G.product.release_date),
			runtimeLengthMin: B017V4IM1G.product.runtime_length_min,
			title: B017V4IM1G.product.title,
			seriesPrimary: {
				asin: B017V4IM1G.product.series[0].asin,
				name: B017V4IM1G.product.series[0].title,
				position: B017V4IM1G.product.series[0].sequence
			},
			seriesSecondary: {
				asin: B017V4IM1G.product.series[1].asin,
				name: B017V4IM1G.product.series[1].title,
				position: B017V4IM1G.product.series[1].sequence
			}
		}
	})

	it('returned the correct data', () => {
		expect(response).toEqual(minimalParsed)
	})
})
