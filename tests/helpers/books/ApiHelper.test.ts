import { apiResponse, parsedBook } from '../../datasets/helpers/books'

import ApiHelper from '#helpers/books/audible/ApiHelper'

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

test('should setup constructor correctly', () => {
	expect(helper.asin).toBe('B079LRSMNN')
	expect(helper.reqUrl).toBe(
		'https://api.audible.com/1.0/catalog/products/B079LRSMNN/?response_groups=contributors,product_desc,product_extended_attrs,product_attrs,media,rating,series&image_sizes=500,1024'
	)
})

test.todo('should check required keys')

test('should throw error if no input data', () => {
	helper.inputJson = undefined
	expect(() => helper.getHighResImage()).toThrowError('No input data')
	expect(() => helper.getReleaseDate()).toThrowError('No input data')
	expect(() => helper.getSeriesPrimary(apiResponse.product.series)).toThrowError('No input data')
	expect(() => helper.getSeriesSecondary(apiResponse.product.series)).toThrowError('No input data')
	expect(() => helper.getFinalData()).toThrowError('No input data')
})

test('should get high res image', () => {
	expect(helper.getHighResImage()).toBe('https://m.media-amazon.com/images/I/91spdScZuIL.jpg')
})

test('should get release date', () => {
	expect(helper.getReleaseDate()).toBeInstanceOf(Date)
})

test('should get series', () => {
	// Should return undefined if no series title
	expect(helper.getSeries({ asin: '123', title: '', sequence: '1', url: '' })).toBeUndefined()
	expect(helper.getSeries(apiResponse.product.series[0])).toEqual({
		asin: 'B079YXK1GL',
		name: "Galaxy's Edge Series",
		position: '1-2'
	})
})

test('should get series primary', () => {
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

test.todo('should get series without position')

test('should get final data', () => {
	const data = helper.getFinalData()
	expect(data).toEqual(parsedBook)
})

test('should fetch book data', async () => {
    jest.spyOn(ApiHelper.prototype, 'fetchBook').mockResolvedValue(apiResponse)
	const data = await helper.fetchBook()
	expect(data).toEqual(apiResponse)
})

test('should throw error if error fetching book data', async () => {
	helper = new ApiHelper('')
	await expect(helper.fetchBook()).rejects.toThrowError(
		'An error has occured while fetching from Audible API. Response: 403, ASIN: '
	)
})

test('should parse response', async () => {
	// Should throw error if input is undefined
	await expect(helper.parseResponse(undefined)).rejects.toThrowError('No API response to parse')

	await expect(helper.parseResponse(apiResponse)).resolves.toEqual(parsedBook)
})
