import { beforeAll, describe, expect, it } from 'bun:test'

import type { ApiBook } from '#config/types'
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
})
