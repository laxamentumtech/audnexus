/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as cheerio from 'cheerio'
import type { FastifyBaseLogger } from 'fastify'
import type { z } from 'zod'

import { ApiGenreSchema } from '#config/types'
import SharedHelper from '#helpers/utils/shared'
import { NoticeGenreNotAvailable } from '#static/messages'
import {
	htmlResponseGenreNoHref,
	htmlResponseGenreOnly,
	htmlResponseNameOnly
} from '#tests/datasets/audible/authors/scrape'
import { parsedAuthor } from '#tests/datasets/helpers/authors'
import {
	bookWithoutProjection,
	bookWithoutProjectionUpdatedNow,
	changedParsedBook,
	parsedBook
} from '#tests/datasets/helpers/books'
let helper: SharedHelper
beforeAll(() => {
	helper = new SharedHelper()
})

describe('SharedHelper should', () => {
	afterEach(() => {
		jest.restoreAllMocks()
	})

	test('build a URL', () => {
		const baseDomain = 'https://api.audible'
		const baseUrl = '1.0/catalog/products'
		const params =
			'response_groups=contributors,product_desc,product_extended_attrs,product_attrs,media,rating,series&image_sizes=500,1024'
		const url = helper.buildUrl('123456789', baseDomain, 'com', baseUrl, params)
		expect(url).toBe(
			'https://api.audible.com/1.0/catalog/products/123456789?response_groups=contributors,product_desc,product_extended_attrs,product_attrs,media,rating,series&image_sizes=500,1024'
		)
	})

	test('check data equality', () => {
		expect(helper.isEqualData(parsedBook, parsedBook)).toBe(true)
		expect(helper.isEqualData(changedParsedBook, parsedBook)).toBe(false)
	})

	test('check if recently updated', () => {
		expect(helper.isRecentlyUpdated(bookWithoutProjectionUpdatedNow)).toBe(true)
		expect(helper.isRecentlyUpdated(bookWithoutProjection)).toBe(false)
	})

	test('get asin from url', () => {
		expect(
			helper.getAsinFromUrl('https://www.audible.com/pd/Galaxys-Edge-Audiobook/B079LRSMNN')
		).toBe('B079LRSMNN')
		expect(
			helper.getAsinFromUrl(
				'https://www.audible.com/pd/Galaxys-Edge-Audiobook/B079LRSMNN?qid=1658874273&sr=1-1&ref=a_search_c3_lProduct_1_1&pf_rd_p=83218cca-c308-412f-bfcf-90198b687a2f&pf_rd_r=7QSJ1Z5PQJVRPYE7ZF6V'
			)
		).toBe('B079LRSMNN')
		// should return undefined if no asin
		expect(
			helper.getAsinFromUrl('https://www.audible.com/pd/Galaxys-Edge-Audiobook/')
		).toBeUndefined()
	})

	test('get genre asin from url', () => {
		expect(
			helper.getGenreAsinFromUrl(
				'https://www.audible.com/cat/Science-Fiction/Military-Audiobooks/18580641011?ref=a_pd_Galaxy_c9_topic-tags_1&pf_rd_p=185bc0d6-e1e0-4345-b88d-545c324f8afa&pf_rd_r=7QSJ1Z5PQJVRPYE7ZF6V'
			)
		).toBe('18580641011')
		// Should fail on regular asin
		expect(
			helper.getGenreAsinFromUrl(
				'https://www.audible.com/pd/Galaxys-Edge-Audiobook/B079LRSMNN?qid=1658874273&sr=1-1&ref=a_search_c3_lProduct_1_1&pf_rd_p=83218cca-c308-412f-bfcf-90198b687a2f'
			)
		).toBeUndefined()
		// should fail on no asin
		expect(
			helper.getGenreAsinFromUrl('https://www.audible.com/cat/Science-Fiction/Military-Audiobooks/')
		).toBeUndefined()
	})

	test('collectGenres returns empty array if no genres', () => {
		const asin = 'B012DQ3BCM'
		const html = cheerio.load(htmlResponseNameOnly)
		const genres = html('div.contentPositionClass div.bc-box a.bc-color-link')
			.toArray()
			.map((element) => html(element))
		expect(helper.collectGenres(asin, genres, 'genre').length).toBeFalsy()
	})

	test('collectGenres returns array of genres', () => {
		const asin = 'B012DQ3BCM'
		const html = cheerio.load(htmlResponseGenreOnly)
		const genres = html('div.contentPositionClass div.bc-box a.bc-color-link')
			.toArray()
			.map((element) => html(element))
		expect(helper.collectGenres(asin, genres, 'genre')).toEqual(parsedAuthor.genres)
	})

	test('collectGenres logs error on genre without asin', () => {
		const asin = 'B012DQ3BCM'
		const html = cheerio.load(htmlResponseGenreNoHref)
		const genres = html('div.contentPositionClass div.bc-box a.bc-color-link')
			.toArray()
			.map((element) => html(element))
		expect(helper.collectGenres(asin, genres, 'genre')).toEqual([parsedAuthor.genres![0]])
	})

	test('collectGenres logs warning when ApiGenreSchema.safeParse fails', () => {
		const mockWarn = jest.fn()
		const mockLogger = {
			warn: mockWarn,
			info: jest.fn()
		}
		const helperWithLogger = new SharedHelper(mockLogger as unknown as FastifyBaseLogger)
		const asin = 'B012DQ3BCM'

		// Create HTML with a valid genre link
		const html = cheerio.load(htmlResponseGenreOnly)
		const genres = html('div.contentPositionClass div.bc-box a.bc-color-link')
			.toArray()
			.map((element) => html(element))

		// Mock safeParse to return failure
		const mockError = { issues: [{ message: 'Invalid genre ASIN' }] } as unknown as z.ZodError<{
			asin: string
			name: string
			type: string
		}>
		jest.spyOn(ApiGenreSchema, 'safeParse').mockReturnValue({
			success: false,
			error: mockError
		})

		helperWithLogger.collectGenres(asin, genres, 'genre')

		expect(mockWarn).toHaveBeenCalledWith(mockError)
		expect(mockWarn).toHaveBeenCalledTimes(2) // Two genres in the HTML
	})

	test('collectGenres logs info when genre has no href', () => {
		const mockInfo = jest.fn()
		const mockLogger = {
			warn: jest.fn(),
			info: mockInfo
		}
		const helperWithLogger = new SharedHelper(mockLogger as unknown as FastifyBaseLogger)
		const asin = 'B012DQ3BCM'

		// Use HTML that has a genre without href (second genre)
		const html = cheerio.load(htmlResponseGenreNoHref)
		const genres = html('div.contentPositionClass div.bc-box a.bc-color-link')
			.toArray()
			.map((element) => html(element))

		helperWithLogger.collectGenres(asin, genres, 'genre')

		// Second genre has no href, so it should log info with index 1
		expect(mockInfo).toHaveBeenCalledWith(NoticeGenreNotAvailable(asin, 1))
		expect(mockInfo).toHaveBeenCalledTimes(1)
	})

	test('sortObjectByKeys', () => {
		const obj = {
			b: 1,
			a: 2,
			c: 3
		} as Record<string, unknown>
		expect(helper.sortObjectByKeys(obj)).toEqual({
			a: 2,
			b: 1,
			c: 3
		})
	})
})
