jest.mock('#helpers/utils/fetchPlus')
jest.mock('#helpers/utils/shared')
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { AudibleProduct } from '#config/typing/audible'
import ApiHelper from '#helpers/books/audible/ApiHelper'
import * as fetchPlus from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'
import { regions } from '#static/regions'
import {
	B07BS4RKGH,
	B017V4IM1G,
	podcast,
	setupMinimalParsed
} from '#tests/datasets/audible/books/api'
import { apiResponse, parsedBook, parsedBookWithoutNarrators } from '#tests/datasets/helpers/books'

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
	mockResponse = deepCopy(apiResponse)
	// Set up spys
	jest.spyOn(SharedHelper.prototype, 'getParamString').mockReturnValue(params)
	jest.spyOn(SharedHelper.prototype, 'buildUrl').mockReturnValue(url)
	jest
		.spyOn(fetchPlus, 'default')
		.mockImplementation(() =>
			Promise.resolve({ ok: true, status: 200, json: () => mockResponse } as unknown as Response)
		)
	// Set up helpers
	helper = new ApiHelper(asin, region)
})

describe('ApiHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.reqUrl).toBe(url)
	})

	test.todo('check required keys')

	test('get high res image', async () => {
		const data = await helper.fetchBook()
		await helper.parseResponse(data)
		expect(helper.getHighResImage()).toBe('https://m.media-amazon.com/images/I/91spdScZuIL.jpg')
	})

	test('get release date', async () => {
		const data = await helper.fetchBook()
		await helper.parseResponse(data)
		expect(helper.getReleaseDate()).toBeInstanceOf(Date)
	})

	test('get series', async () => {
		const data = await helper.fetchBook()
		await helper.parseResponse(data)
		// Should return undefined if no series title
		expect(helper.getSeries({ asin: '123', title: '', sequence: '1', url: '' })).toBeUndefined()
		expect(helper.getSeries(mockResponse.product.series![0])).toEqual({
			asin: 'B079YXK1GL',
			name: "Galaxy's Edge Series",
			position: '1-2'
		})
	})

	test('get series primary', async () => {
		const data = await helper.fetchBook()
		await helper.parseResponse(data)
		// Should return undefined if no series name
		expect(
			helper.getSeriesPrimary([{ asin: '123', title: '', sequence: '1', url: '' }])
		).toBeUndefined()
		expect(helper.getSeriesPrimary(mockResponse.product.series)).toEqual({
			asin: 'B079YXK1GL',
			name: "Galaxy's Edge Series",
			position: '1-2'
		})
	})

	test.todo('get series without position')

	test('fetch book data', async () => {
		const data = await helper.fetchBook()
		await helper.parseResponse(data)
		expect(data).toEqual(mockResponse)
	})

	test('parse response', async () => {
		const data = await helper.fetchBook()
		const parsed = helper.parseResponse(data)
		await expect(parsed).resolves.toEqual(parsedBook)
	})

	test('parse response with podcast', async () => {
		const genres = [
			{
				asin: '18580606011',
				name: 'Science Fiction & Fantasy',
				type: 'genre'
			},
			{
				asin: '18580607011',
				name: 'Fantasy',
				type: 'tag'
			},
			{
				asin: '18580628011',
				name: 'Science Fiction',
				type: 'tag'
			}
		]
		const image = 'https://m.media-amazon.com/images/I/9125JjSWeCL.jpg'
		const minimalParsed = setupMinimalParsed(
			podcast.product,
			podcast.product.merchandising_summary,
			image,
			genres
		)
		await expect(helper.parseResponse(podcast)).resolves.toEqual(minimalParsed)
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
		helper.inputJson = data.product
		helper.inputJson!.narrators = undefined

		expect(helper.getFinalData()).toEqual(parsedBookWithoutNarrators)
	})

	test('pass key check with a number value of 0', async () => {
		const data = await helper.fetchBook()
		await helper.parseResponse(data)
		helper.inputJson!.runtime_length_min = 0
		expect(helper.hasRequiredKeys().isValid).toBe(true)
	})

	test('get backup lower res image', async () => {
		const data = await helper.fetchBook()
		await helper.parseResponse(data)
		helper.inputJson!.product_images![1024] = ''
		expect(helper.getHighResImage()).toBe('https://m.media-amazon.com/images/I/51OIn2FgdtL.jpg')
	})

	test('handle no image', async () => {
		const data = await helper.fetchBook()
		await helper.parseResponse(data)
		helper.inputJson!.product_images = {}
		expect(helper.getHighResImage()).toBeUndefined()
	})

	test('handle no product_images object', async () => {
		const data = await helper.fetchBook()
		await helper.parseResponse(data)
		helper.inputJson!.product_images = undefined
		expect(helper.getHighResImage()).toBeUndefined()
	})

	test('use issue_date if release_date is not available', async () => {
		const data = await helper.fetchBook()
		await helper.parseResponse(data)
		helper.inputJson!.issue_date = helper.inputJson!.release_date
		helper.inputJson!.release_date = ''
		expect(helper.getReleaseDate()).toBeInstanceOf(Date)
	})

	test('handle empty series array', () => {
		expect(helper.getSeriesPrimary(undefined)).toBeUndefined()
		expect(helper.getSeriesSecondary(undefined)).toBeUndefined()
	})

	test('parse a book with 2 series', async () => {
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

	test('retry fetching book data', async () => {
		// Mock Fetch to fail once
		jest
			.spyOn(global, 'fetch')
			.mockImplementationOnce(() => Promise.reject())
			.mockImplementationOnce(() =>
				Promise.resolve({
					json: () => Promise.resolve(mockResponse),
					ok: true,
					status: 200
				} as Response)
			)
		const data = await helper.fetchBook()
		expect(data).toEqual(mockResponse)
	})

	test('not pass key check when on falsy value', async () => {
		const data = await helper.fetchBook()
		await helper.parseResponse(data)
		helper.inputJson!.asin = ''
		expect(helper.hasRequiredKeys().isValid).toBe(false)
	})

	test('allow podcast to pass key check', () => {
		helper.inputJson = podcast.product
		expect(helper.hasRequiredKeys().isValid).toBe(true)
	})
})

describe('ApiHelper should throw error when', () => {
	test('no input data', () => {
		expect(() => helper.hasRequiredKeys()).toThrowError('No input data')
		expect(() => helper.getCategories()).toThrowError('No input data')
		expect(() => helper.getHighResImage()).toThrowError('No input data')
		expect(() => helper.getReleaseDate()).toThrowError('No input data')
		expect(() => helper.getSeriesPrimary(mockResponse.product.series)).toThrowError('No input data')
		expect(() => helper.getSeriesSecondary(mockResponse.product.series)).toThrowError(
			'No input data'
		)
		expect(() => helper.getFinalData()).toThrowError('No input data')
	})

	test('release_date is in the future', async () => {
		const data = await helper.fetchBook()
		await helper.parseResponse(data)
		helper.inputJson!.release_date = '2080-01-01'
		expect(() => helper.getReleaseDate()).toThrowError('Release date is in the future')
	})

	test('error fetching book data', async () => {
		// Mock Fetch to fail once
		jest.spyOn(fetchPlus, 'default').mockImplementation(() =>
			Promise.reject({
				json: () => Promise.resolve(mockResponse),
				ok: false,
				status: 403
			} as Response)
		)
		asin = ''
		helper = new ApiHelper(asin, region)
		await expect(helper.fetchBook()).rejects.toThrowError(
			`An error occured while fetching data from Audible API. Response: 403, ASIN: ${asin}`
		)
	})

	test('input is undefined', async () => {
		await expect(helper.parseResponse(undefined)).rejects.toThrowError(
			`An error occurred while parsing Audible API. ASIN: ${asin}`
		)
	})

	test('book has no title', async () => {
		asin = 'B07BS4RKGH'
		helper = new ApiHelper(asin, region)
		// Setup variable without title
		const data = B07BS4RKGH as unknown as AudibleProduct
		await expect(helper.parseResponse(data)).rejects.toThrowError(
			`Required key 'title' does not exist in Audible API response for ASIN ${asin}`
		)
	})
})
