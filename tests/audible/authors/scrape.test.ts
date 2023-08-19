import { ApiAuthorProfile } from '#config/types'
import ScrapeHelper from '#helpers/authors/audible/ScrapeHelper'
import {
	authorParsedB00G0WYW92,
	authorParsedB0034NFIOI
} from '#tests/datasets/audible/authors/scrape'

let asin: string
let helper: ScrapeHelper
let response: ApiAuthorProfile

describe('Audible Author HTML', () => {
	describe('When scraping Andy Weir from Audible', () => {
		beforeAll(async () => {
			asin = 'B00G0WYW92'
			helper = new ScrapeHelper(asin, 'us')
			response = await helper.process()
		}, 10000)

		it('returned the correct asin', () => {
			expect(response.asin).toEqual(authorParsedB00G0WYW92.asin)
		})

		it('returned the correct name', () => {
			expect(response.name).toEqual(authorParsedB00G0WYW92.name)
		})

		it('returned the correct genres', () => {
			expect(response.genres).toEqual(authorParsedB00G0WYW92.genres)
		})

		it('returned the correct image', () => {
			expect(response.image).toEqual(authorParsedB00G0WYW92.image)
		})

		it('returned the correct description', () => {
			expect(response.description).toEqual(authorParsedB00G0WYW92.description)
		})

		it('returned a region', () => {
			expect(response.region).toEqual(authorParsedB00G0WYW92.region)
		})

		it('returned similar authors', () => {
			expect(response.similar?.length).toEqual(authorParsedB00G0WYW92.similar?.length)
		})
	})

	describe('When scraping an author with no description or image from Audible', () => {
		beforeAll(async () => {
			asin = 'B0034NFIOI'
			helper = new ScrapeHelper(asin, 'us')
			response = await helper.process()
		}, 10000)

		it('returned the correct asin', () => {
			expect(response.asin).toEqual(authorParsedB0034NFIOI.asin)
		})

		it('returned the correct name', () => {
			expect(response.name).toEqual(authorParsedB0034NFIOI.name)
		})

		it('returned the correct genres', () => {
			expect(response.genres).toEqual(authorParsedB0034NFIOI.genres)
		})

		it('returned no image', () => {
			expect(response.image).toEqual(authorParsedB0034NFIOI.image)
		})

		it('returned no description', () => {
			expect(response.description).toEqual(authorParsedB0034NFIOI.description)
		})

		it('returned a region', () => {
			expect(response.region).toEqual(authorParsedB0034NFIOI.region)
		})

		it('returned similar authors', () => {
			expect(response.similar?.length).toEqual(authorParsedB0034NFIOI.similar?.length)
		})
	})

	describe('When fetching a 404 author from Audible', () => {
		beforeAll(() => {
			asin = '103940202X'
			helper = new ScrapeHelper(asin, 'us')
		})

		it('threw an error', async () => {
			await expect(helper.fetchAuthor()).rejects.toThrowError(
				`An error occured while fetching data from Audible HTML. Response: 404, ASIN: ${asin}`
			)
		})
	})
	describe('When fetching a book as an author from Audible', () => {
		beforeAll(() => {
			asin = 'B079LRSMNN'
			helper = new ScrapeHelper(asin, 'us')
		})

		it('threw an error', async () => {
			const response = await helper.fetchAuthor()
			await expect(helper.parseResponse(response)).rejects.toThrowError(
				`Item not available in region 'us' for ASIN: ${asin}`
			)
		})
	})
})
