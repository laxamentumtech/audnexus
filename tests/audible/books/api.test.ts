import { beforeAll, describe, expect, it } from 'bun:test'

import type { ApiBook, AudibleProduct } from '#config/types'
import ApiHelper from '#helpers/books/audible/ApiHelper'
import { B08C6YJ1LS, B017V4IM1G, setupMinimalParsed } from '#tests/datasets/audible/books/api'
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
let minimalParsed: ApiBook

describe('Audible API', () => {
	describe('When parsing The Coldest Case', () => {
		let response: ApiBook
		beforeAll(async () => {
			asin = 'B08C6YJ1LS'
			helper = new ApiHelper(asin, 'us')
			const parsed = await helper.parseResponse(B08C6YJ1LS)
			if (!parsed.genres) throw new Error('Parsed is undefined')
			response = parsed
			minimalParsed = setupMinimalParsed(
				B08C6YJ1LS.product,
				B08C6YJ1LScopyright,
				B08C6YJ1LSdescription,
				B08C6YJ1LSimage,
				parsed.genres
			)
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
			const parsed = await helper.parseResponse(B017V4IM1G)
			if (!parsed.genres) throw new Error('Parsed is undefined')
			response = parsed
			minimalParsed = setupMinimalParsed(
				B017V4IM1G.product,
				B017V4IM1Gcopyright,
				B017V4IM1Gdescription,
				B017V4IM1Gimage,
				parsed.genres
			)
		})

		it('returned the correct data', () => {
			expect(response).toEqual(minimalParsed)
		})
	})

	describe('When Audible omits rating distributions', () => {
		let product: AudibleProduct['product']
		let response: ApiBook
		let ratings: ApiBook['ratings']

		beforeAll(async () => {
			// Strip the distributions Audible sometimes omits for some products
			product = {
				...B08C6YJ1LS.product,
				rating: {
					...B08C6YJ1LS.product.rating!,
					performance_distribution: undefined,
					story_distribution: undefined
				}
			}
			helper = new ApiHelper('B08C6YJ1LS', 'us')
			response = await helper.parseResponse({
				...B08C6YJ1LS,
				product
			})
			if (!response.genres) throw new Error('Parsed is undefined')
			minimalParsed = setupMinimalParsed(
				product,
				B08C6YJ1LScopyright,
				B08C6YJ1LSdescription,
				B08C6YJ1LSimage,
				response.genres
			)
			ratings = minimalParsed.ratings
		})

		it('returned the correct data', () => {
			expect(response).toEqual(minimalParsed)
		})

		it('omits absent performance and story distributions while retaining the core ratings', () => {
			expect(ratings).toBeDefined()
			expect(ratings).not.toHaveProperty('performanceDistribution')
			expect(ratings).not.toHaveProperty('storyDistribution')
			expect(ratings?.value).toBe('4.3')
			expect(ratings?.numRatings).toBe(22066)
			expect(ratings?.numReviews).toBe(1920)
			expect(ratings?.distribution).toEqual({
				five: 13235,
				four: 5093,
				three: 2301,
				two: 793,
				one: 644
			})
		})
	})
})
