import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'

import { ApiAuthorProfile } from '#config/types'
import ScrapeHelper from '#helpers/authors/audible/ScrapeHelper'
import * as fetchPlus from '#helpers/utils/fetchPlus'
import {
	authorParsedB00G0WYW92,
	authorParsedB0034NFIOI,
	mockHtmlB00G0WYW92,
	mockHtmlB0034NFIOI
} from '#tests/datasets/audible/authors/scrape'

jest.mock('#helpers/utils/fetchPlus')

let asin: string
let helper: ScrapeHelper
let response: ApiAuthorProfile

const createMockResponse = (data: string, status: number): AxiosResponse => ({
	data,
	status,
	statusText: status === 200 ? 'OK' : 'Not Found',
	headers: {},
	config: {} as InternalAxiosRequestConfig
})

describe('Audible Author HTML', () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	describe('When scraping Andy Weir from Audible', () => {
		beforeAll(async () => {
			asin = 'B00G0WYW92'
			helper = new ScrapeHelper(asin, 'us')
			jest
				.spyOn(fetchPlus, 'default')
				.mockImplementation(() => Promise.resolve(createMockResponse(mockHtmlB00G0WYW92, 200)))
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
			jest
				.spyOn(fetchPlus, 'default')
				.mockImplementation(() => Promise.resolve(createMockResponse(mockHtmlB0034NFIOI, 200)))
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
		it('threw an error', async () => {
			asin = '103940202X'
			helper = new ScrapeHelper(asin, 'us')
			jest.spyOn(fetchPlus, 'default').mockImplementation(() => Promise.reject({ status: 404 }))
			await expect(helper.fetchAuthor()).rejects.toThrow(
				`An error occured while fetching data from Audible HTML. Response: 404, ASIN: ${asin}`
			)
		})
	})

	describe('When fetching a book as an author from Audible', () => {
		it('threw an error', async () => {
			asin = 'B079LRSMNN'
			helper = new ScrapeHelper(asin, 'us')
			jest
				.spyOn(fetchPlus, 'default')
				.mockImplementation(() =>
					Promise.resolve(
						createMockResponse(
							'<html><body><h1 class="bc-heading bc-color-base bc-size-extra-large bc-text-secondary bc-text-bold">Showing titles\n in All Categories</h1></body></html>',
							200
						)
					)
				)
			const response = await helper.fetchAuthor()
			await expect(helper.parseResponse(response)).rejects.toThrow(
				`Item not available in region 'us' for ASIN: ${asin}`
			)
		})
	})
})
