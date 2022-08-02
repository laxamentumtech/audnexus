import ApiHelper from '#helpers/books/audible/ApiHelper'
import { B07BS4RKGH, B017V4IM1G } from '#tests/datasets/audible/api'
import { apiResponse, parsedBook } from '#tests/datasets/helpers/books'

let helper: ApiHelper

beforeEach(() => {
	// Set up helpers
	helper = new ApiHelper('B079LRSMNN')
	helper.inputJson = apiResponse.product
})

afterEach(() => {
	// Reset helper
	helper = new ApiHelper('B079LRSMNN')
	// https://github.com/facebook/jest/issues/7136
	jest.resetAllMocks()
	jest.restoreAllMocks()
})

describe('ApiHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe('B079LRSMNN')
		expect(helper.reqUrl).toBe(
			'https://api.audible.com/1.0/catalog/products/B079LRSMNN/?response_groups=contributors,product_desc,product_extended_attrs,product_attrs,media,rating,series&image_sizes=500,1024'
		)
	})

	test.todo('check required keys')

	test('get high res image', () => {
		expect(helper.getHighResImage()).toBe('https://m.media-amazon.com/images/I/91spdScZuIL.jpg')
	})

	test('get release date', () => {
		expect(helper.getReleaseDate()).toBeInstanceOf(Date)
	})

	test('get series', () => {
		// Should return undefined if no series title
		expect(helper.getSeries({ asin: '123', title: '', sequence: '1', url: '' })).toBeUndefined()
		expect(helper.getSeries(apiResponse.product.series[0])).toEqual({
			asin: 'B079YXK1GL',
			name: "Galaxy's Edge Series",
			position: '1-2'
		})
	})

	test('get series primary', () => {
		// Should return undefined if no series name
		expect(
			helper.getSeriesPrimary([{ asin: '123', title: '', sequence: '1', url: '' }])
		).toBeUndefined()
		expect(helper.getSeriesPrimary(apiResponse.product.series)).toEqual({
			asin: 'B079YXK1GL',
			name: "Galaxy's Edge Series",
			position: '1-2'
		})
	})

	test.todo('get series without position')

	test('fetch book data', async () => {
		jest.spyOn(ApiHelper.prototype, 'fetchBook').mockResolvedValue(apiResponse)
		const data = await helper.fetchBook()
		expect(data).toEqual(apiResponse)
	})

	test('parse response', async () => {
		await expect(helper.parseResponse(apiResponse)).resolves.toEqual(parsedBook)
	})
})

describe('ApiHelper edge cases should', () => {
	test('get backup lower res image', () => {
		helper.inputJson.product_images[1024] = undefined
		expect(helper.getHighResImage()).toBe('https://m.media-amazon.com/images/I/51OIn2FgdtL.jpg')
	})

	test('handle no image', () => {
		helper.inputJson.product_images = undefined
		expect(helper.getHighResImage()).toBe(undefined)
	})

	test('use issue_date if release_date is not available', () => {
		helper.inputJson.issue_date = helper.inputJson.release_date
		helper.inputJson.release_date = undefined
		expect(helper.getReleaseDate()).toBeInstanceOf(Date)
	})

	test('handle empty series array', () => {
		expect(helper.getSeriesPrimary(undefined)).toBeUndefined()
		expect(helper.getSeriesSecondary(undefined)).toBeUndefined()
	})

	test('parse a book with 2 series', async () => {
		helper = new ApiHelper('B017V4IM1G')
		const data = await helper.parseResponse(B017V4IM1G)
		expect(data.seriesPrimary).toEqual({
			asin: B017V4IM1G.product.series[0].asin,
			name: B017V4IM1G.product.series[0].title,
			position: B017V4IM1G.product.series[0].sequence
		})
		expect(data.seriesSecondary).toEqual({
			asin: B017V4IM1G.product.series[1].asin,
			name: B017V4IM1G.product.series[1].title,
			position: B017V4IM1G.product.series[1].sequence
		})
	})
})

describe('ApiHelper should throw error when', () => {
	test('no input data', () => {
		helper.inputJson = undefined
		expect(() => helper.getHighResImage()).toThrowError('No input data')
		expect(() => helper.getReleaseDate()).toThrowError('No input data')
		expect(() => helper.getSeriesPrimary(apiResponse.product.series)).toThrowError('No input data')
		expect(() => helper.getSeriesSecondary(apiResponse.product.series)).toThrowError(
			'No input data'
		)
		expect(() => helper.getFinalData()).toThrowError('No input data')
	})

	test('release_date is in the future', () => {
		helper.inputJson.release_date = '2080-01-01'
		expect(() => helper.getReleaseDate()).toThrowError('Release date is in the future')
	})

	test('error fetching book data', async () => {
		helper = new ApiHelper('')
		await expect(helper.fetchBook()).rejects.toThrowError(
			'An error has occured while fetching from Audible API. Response: 403, ASIN: '
		)
	})

	test('input is undefined', async () => {
		await expect(helper.parseResponse(undefined)).rejects.toThrowError('No API response to parse')
	})

	test('book has no title', async () => {
		helper = new ApiHelper('B07BS4RKGH')
		await expect(helper.parseResponse(B07BS4RKGH)).rejects.toThrowError(
			'Required key: title, does not exist on: B07BS4RKGH'
		)

		helper.inputJson = B07BS4RKGH.product
		expect(() => helper.getFinalData()).toThrowError('No title')
	})
})
