/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { AxiosResponse } from 'axios'
import type { FastifyBaseLogger } from 'fastify'

import {
	AudibleCategory,
	AudibleProduct,
	AudibleProductSchema,
	AudibleSeries,
	fallbackShape
} from '#config/types'
import ApiHelper from '#helpers/books/audible/ApiHelper'
import { ContentTypeMismatchError, NotFoundError } from '#helpers/errors/ApiErrors'
import * as fetchPlus from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'
import { regions } from '#static/regions'
import {
	B0GFYFCX3D,
	B07BS4RKGH,
	B017V4IM1G,
	bookWithoutContentDeliveryType,
	podcast,
	podcastWithoutProgramParticipation
} from '#tests/datasets/audible/books/api'
import { apiResponse, parsedBook, parsedBookWithoutNarrators } from '#tests/datasets/helpers/books'

jest.mock('#helpers/utils/fetchPlus')
jest.mock('#helpers/utils/shared')

let asin: string
let helper: ApiHelper
let mockResponse: AudibleProduct
let region: string
let url: string
const deepCopy = (obj: unknown) => JSON.parse(JSON.stringify(obj))

beforeEach(async () => {
	// Variables
	asin = 'B079LRSMNN'
	region = 'us'
	const params =
		'category_ladders,contributors,product_desc,product_extended_attrs,product_attrs,media,rating,series&image_sizes=500,1024'
	url = `https://api.audible.com/1.0/catalog/products/${asin}/?response_groups=` + params
	mockResponse = AudibleProductSchema.parse(deepCopy(apiResponse))
	// Set up spys
	jest.spyOn(SharedHelper.prototype, 'getParamString').mockReturnValue(params)
	jest.spyOn(SharedHelper.prototype, 'buildUrl').mockReturnValue(url)
	jest
		.spyOn(fetchPlus, 'default')
		.mockImplementation(() => Promise.resolve({ data: mockResponse, status: 200 } as AxiosResponse))
	// Set up helpers
	helper = new ApiHelper(asin, region)
})

describe('ApiHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.requestUrl).toBe(url)
	})

	test.todo('check required keys')

	test('get copyright year', async () => {
		helper.audibleResponse = mockResponse.product
		expect(helper.getCopyrightYear()).toBe(2017)
	})

	test('get high res image', async () => {
		helper.audibleResponse = mockResponse.product
		expect(helper.getHighResImage()).toBe('https://m.media-amazon.com/images/I/91spdScZuIL.jpg')
	})

	test('get release date', async () => {
		helper.audibleResponse = mockResponse.product
		expect(helper.getReleaseDate()).toBeInstanceOf(Date)
	})

	test('get series', async () => {
		// Make lint happy
		if (mockResponse.product.content_delivery_type !== 'MultiPartBook') return undefined
		helper.audibleResponse = mockResponse.product
		// Should return undefined if no series title
		expect(helper.getSeries({ asin: '123', title: '', sequence: '1', url: '' })).toBeUndefined()
		expect(helper.getSeries(mockResponse.product.series![0])).toEqual({
			asin: 'B079YXK1GL',
			name: "Galaxy's Edge Series",
			position: '1-2'
		})
	})

	test('get series primary', async () => {
		// Make lint happy
		if (mockResponse.product.content_delivery_type !== 'MultiPartBook') return undefined
		helper.audibleResponse = mockResponse.product
		// Should return undefined if no series name
		expect(
			helper.getSeriesPrimary([{ asin: '123', title: '', sequence: '1', url: '' }])
		).toBeUndefined()
		expect(
			helper.getSeriesPrimary([
				{
					asin: 'B079YXK1GL',
					sequence: '1-2',
					title: "Galaxy's Edge Series",
					url: '/pd/Galaxys-Edge-Series-Audiobook/B079YXK1GL'
				}
			])
		).toEqual({
			asin: 'B079YXK1GL',
			name: "Galaxy's Edge Series",
			position: '1-2'
		})
	})

	test('get series secondary', async () => {
		// Make lint happy
		if (mockResponse.product.content_delivery_type !== 'MultiPartBook') return undefined
		helper.audibleResponse = mockResponse.product
		// Should return undefined if no series name
		expect(
			helper.getSeriesSecondary([{ asin: '123', title: '', sequence: '1', url: '' }])
		).toBeUndefined()
		expect(
			helper.getSeriesSecondary([
				{
					asin: 'B079YXK1GL',
					sequence: '1-2',
					title: "Galaxy's Edge Series",
					url: '/pd/Galaxys-Edge-Series-Audiobook/B079YXK1GL'
				},
				{
					asin: 'B079YXK1GL',
					sequence: '1-2',
					title: "NOT Galaxy's Edge Series",
					url: '/pd/Galaxys-Edge-Series-Audiobook/B079YXK1GL'
				}
			])
		).toEqual({
			asin: 'B079YXK1GL',
			name: "NOT Galaxy's Edge Series",
			position: '1-2'
		})
	})

	test.todo('get series without position')

	test('fetch book data', async () => {
		const data = await helper.fetchBook()
		expect(data).toEqual(mockResponse)
	})

	test('parse response', async () => {
		const data = await helper.fetchBook()
		const parsed = helper.parseResponse(data)
		await expect(parsed).resolves.toEqual(parsedBook)
	})

	test('throws ContentTypeMismatchError for podcast content', async () => {
		await expect(helper.parseResponse(podcast)).rejects.toBeInstanceOf(ContentTypeMismatchError)
		await expect(helper.parseResponse(podcast)).rejects.toMatchObject({
			name: 'ContentTypeMismatchError',
			statusCode: 400,
			message: `Item is a podcast, not a book. ASIN: ${asin}`,
			details: {
				asin: asin,
				requestedType: 'book',
				actualType: 'PodcastParent'
			}
		})
	})

	test('throws ContentTypeMismatchError for podcast without program_participation', async () => {
		await expect(helper.parseResponse(podcastWithoutProgramParticipation)).rejects.toBeInstanceOf(
			ContentTypeMismatchError
		)
		await expect(helper.parseResponse(podcastWithoutProgramParticipation)).rejects.toMatchObject({
			name: 'ContentTypeMismatchError',
			statusCode: 400,
			message: `Item is a podcast, not a book. ASIN: ${asin}`,
			details: {
				asin: asin,
				requestedType: 'book',
				actualType: 'PodcastParent'
			}
		})
	})

	describe('handle region: ', () => {
		test.each(Object.keys(regions))('%s', async (region) => {
			helper = new ApiHelper('B079LRSMNN', region)
			const data = await helper.fetchBook()
			const parsed = await helper.parseResponse(data)
			expect(parsed.region).toEqual(region)
		})
	})
})

describe('ApiHelper edge cases should', () => {
	test('parse a book with no narrators', async () => {
		const data = await helper.fetchBook()
		// Directly set inputjson
		helper.audibleResponse = data.product
		helper.audibleResponse!.narrators = undefined

		expect(helper.getFinalData()).toEqual(parsedBookWithoutNarrators)
	})

	test('pass key check with a number value of 0', async () => {
		const data = mockResponse
		mockResponse.product.runtime_length_min = 0
		const parsed = await helper.parseResponse(data)
		expect(parsed).toBeDefined()
	})

	test('series should be undefined if no series', async () => {
		const obj = {
			asin: '123',
			title: '',
			sequence: '1'
		}
		expect(helper.getSeries(obj)).toBeUndefined()
	})

	test('getSeriesX should return undefined if not a multi part book', async () => {
		const obj = {
			asin: '123',
			title: '',
			sequence: '1'
		}
		helper.audibleResponse = mockResponse.product
		helper.audibleResponse!.content_delivery_type = 'SinglePartBook'
		expect(helper.getSeriesPrimary([obj])).toBeUndefined()
		expect(helper.getSeriesSecondary([obj])).toBeUndefined()
	})

	test('getSeriesPrimary returns undefined when content_delivery_type is Unknown', async () => {
		const obj = {
			asin: '123',
			title: 'Test Series',
			sequence: '1'
		}
		helper.audibleResponse = fallbackShape.parse({
			...mockResponse.product,
			content_delivery_type: 'Unknown'
		})
		expect(helper.getSeriesPrimary([obj])).toBeUndefined()
	})

	test('getSeriesSecondary returns undefined when content_delivery_type is Unknown', async () => {
		const obj = {
			asin: '123',
			title: 'Test Series',
			sequence: '1'
		}
		helper.audibleResponse = fallbackShape.parse({
			...mockResponse.product,
			content_delivery_type: 'Unknown'
		})
		expect(helper.getSeriesSecondary([obj])).toBeUndefined()
	})

	test('get backup lower res image', async () => {
		helper.audibleResponse = mockResponse.product
		helper.audibleResponse!.product_images![1024] = ''
		expect(helper.getHighResImage()).toBe('https://m.media-amazon.com/images/I/51OIn2FgdtL.jpg')
	})

	test('handle no image', async () => {
		helper.audibleResponse = mockResponse.product
		helper.audibleResponse!.product_images = {}
		expect(helper.getHighResImage()).toBeUndefined()
	})

	test('handle no product_images object', async () => {
		helper.audibleResponse = mockResponse.product
		helper.audibleResponse!.product_images = undefined
		expect(helper.getHighResImage()).toBeUndefined()
	})

	test('use issue_date if release_date is not available', async () => {
		helper.audibleResponse = mockResponse.product
		helper.audibleResponse!.issue_date = helper.audibleResponse!.release_date
		helper.audibleResponse!.release_date = ''
		expect(helper.getReleaseDate()).toBeInstanceOf(Date)
	})

	test('parse a book with 2 series', async () => {
		// Make lint happy
		if (B017V4IM1G.product.content_delivery_type !== 'MultiPartBook') return undefined
		helper = new ApiHelper('B017V4IM1G', region)
		const data = await helper.parseResponse(B017V4IM1G)
		expect(data.seriesPrimary).toEqual({
			asin: B017V4IM1G.product.series![0].asin,
			name: B017V4IM1G.product.series![0].title,
			position: B017V4IM1G.product.series![0].sequence
		})
		expect(data.seriesSecondary).toEqual({
			asin: B017V4IM1G.product.series![1].asin,
			name: B017V4IM1G.product.series![1].title,
			position: B017V4IM1G.product.series![1].sequence
		})
	})

	test('return false on empty input to isGenre', async () => {
		expect(helper.isGenre(null)).toBeFalsy()
	})

	test('parse a book without social_media_images', async () => {
		helper = new ApiHelper('B0GFYFCX3D', region)
		const data = await helper.parseResponse(B0GFYFCX3D)
		expect(data.asin).toBe('B0GFYFCX3D')
		expect(data.title).toBe('Test Book Without Social Media Images')
		expect(data.authors).toEqual([{ asin: 'B000AP9A6K', name: 'Test Author' }])
	})

	test('parses book without content_delivery_type successfully', async () => {
		helper = new ApiHelper('B0GM8R53L2', region)
		const data = await helper.parseResponse(
			bookWithoutContentDeliveryType as unknown as AudibleProduct
		)
		expect(data.asin).toBe('B0GM8R53L2')
		expect(data.title).toBe('Test Book Without Content Delivery Type')
	})

	test('parses book with unknown content_delivery_type successfully', async () => {
		const unknownTypeResponse = deepCopy(mockResponse)
		unknownTypeResponse.product.content_delivery_type = 'UnknownType'
		const mockLogger = { warn: jest.fn() }
		helper = new ApiHelper(asin, region, mockLogger as unknown as FastifyBaseLogger)
		const data = await helper.parseResponse(unknownTypeResponse)
		expect(data.asin).toBe(asin)
		expect(mockLogger.warn).toHaveBeenCalled()
		expect(mockLogger.warn).toHaveBeenCalledWith(
			expect.stringContaining('Unknown content_delivery_type')
		)
	})

	test('throws region unavailable when baseShape also fails', async () => {
		// Create a response with empty product (missing required baseShape fields)
		const emptyProductResponse = { product: {} } as AudibleProduct
		await expect(helper.parseResponse(emptyProductResponse)).rejects.toThrow(
			`Item not available in region '${region}' for ASIN: ${asin}`
		)
	})

	test('throws NotFoundError with statusCode 404 for unavailable region', async () => {
		// Create a response with empty product (missing required baseShape fields)
		const emptyProductResponse = { product: {} } as AudibleProduct
		await expect(helper.parseResponse(emptyProductResponse)).rejects.toBeInstanceOf(NotFoundError)
		await expect(helper.parseResponse(emptyProductResponse)).rejects.toMatchObject({
			name: 'NotFoundError',
			statusCode: 404,
			message: `Item not available in region '${region}' for ASIN: ${asin}`
		})
	})
})

describe('ApiHelper should throw error when', () => {
	test('no input data', () => {
		expect(() => helper.getCategories()).toThrow('No input data')
		expect(() => helper.getGenres()).toThrow('No input data')
		expect(() => helper.getHighResImage()).toThrow('No input data')
		expect(() => helper.getReleaseDate()).toThrow('No input data')
		expect(() => helper.getSeriesPrimary(['1'] as unknown as AudibleSeries[])).toThrow(
			'No input data'
		)
		expect(() => helper.getSeriesSecondary(['1'] as unknown as AudibleSeries[])).toThrow(
			'No input data'
		)
		expect(() => helper.getTags()).toThrow('No input data')
		expect(() => helper.getFinalData()).toThrow('No input data')
	})

	test('release_date is in the future', async () => {
		helper.audibleResponse = mockResponse.product
		helper.audibleResponse!.release_date = '2080-01-01'
		expect(() => helper.getReleaseDate()).toThrow('Release date is in the future')
	})

	test('category is invalid', () => {
		const obj = {
			id: '1',
			name: ''
		} as AudibleCategory
		expect(() => helper.categoryToApiGenre(obj, 'genre')).toThrow(
			`An error occurred while parsing ApiHelper. ASIN: ${asin}`
		)
	})

	test('error fetching book data', async () => {
		// Mock Fetch to fail once
		jest.spyOn(fetchPlus, 'default').mockImplementation(() =>
			Promise.reject({
				status: 403
			})
		)
		asin = ''
		helper = new ApiHelper(asin, region)
		await expect(helper.fetchBook()).rejects.toThrow(
			`An error occured while fetching data from Audible API. Response: 403, ASIN: ${asin}`
		)
	})

	test('input is undefined', async () => {
		await expect(helper.parseResponse(undefined)).rejects.toThrow(
			`An error occurred while parsing Audible API. ASIN: ${asin}`
		)
	})

	test('book has no title', async () => {
		asin = 'B07BS4RKGH'
		helper = new ApiHelper(asin, region)
		// Setup variable without title
		const data = B07BS4RKGH as unknown as AudibleProduct
		await expect(helper.parseResponse(data)).rejects.toThrow(
			`Required key 'title' does not exist in Audible API response for ASIN ${asin}`
		)
	})
})
