import { AuthorProfile } from '#config/typing/people'
import ScrapeHelper from '#helpers/authors/audible/ScrapeHelper'
import {
	authorParsedB00G0WYW92,
	authorParsedB0034NFIOI
} from '#tests/datasets/audible/authors/scrape'

let asin: string
let helper: ScrapeHelper
let response: AuthorProfile

describe('Audible Author HTML', () => {
	describe('When scraping Andy Weir from Audible', () => {
		beforeAll(async () => {
			asin = 'B00G0WYW92'
			helper = new ScrapeHelper(asin)
			response = await helper.process()
		})

		it('returned the correct data', () => {
			expect(response).toEqual(authorParsedB00G0WYW92)
		})
	})

	describe('When scraping an author with no description or image from Audible', () => {
		beforeAll(async () => {
			asin = 'B0034NFIOI'
			helper = new ScrapeHelper(asin)
			response = await helper.process()
		})

		it('returned the correct data', () => {
			expect(response).toEqual(authorParsedB0034NFIOI)
		})
	})

	describe('When fetching a book as an author from Audible', () => {
		beforeAll(() => {
			asin = '103940202X'
			helper = new ScrapeHelper(asin)
		})

		it('threw an error', async () => {
			await expect(helper.fetchAuthor()).rejects.toThrowError(
				`An error occured while fetching Audible HTML. Response: 404, ASIN: ${asin}`
			)
		})
	})
})
