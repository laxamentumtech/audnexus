import SharedHelper from '#helpers/shared'

const asin = 'B08G9PRS1K'
let baseDomain: string
let baseUrl: string
let params: string
const helper = new SharedHelper()

describe('When building urls', () => {
	it('returned the correct url', () => {
		baseDomain = 'https://api.audible.com'
		baseUrl = '1.0/catalog/products'
		params = '?response_groups=contributors,product_desc,product_extended_attrs,product_attrs,media'
		expect(helper.buildUrl(asin, baseDomain, baseUrl, params)).toEqual(
			'https://api.audible.com/1.0/catalog/products/B08G9PRS1K/?response_groups=contributors,product_desc,product_extended_attrs,product_attrs,media'
		)
	})

	it('returned the correct url', () => {
		baseDomain = 'https://www.audible.com'
		baseUrl = 'pd'
		expect(helper.buildUrl(asin, baseDomain, baseUrl)).toEqual(
			'https://www.audible.com/pd/B08G9PRS1K/'
		)
	})

	it('returned the correct url', () => {
		baseDomain = 'https://api.audible.com'
		baseUrl = '1.0/content'
		params = 'metadata?response_groups=chapter_info'
		expect(helper.buildUrl(asin, baseDomain, baseUrl, params)).toEqual(
			'https://api.audible.com/1.0/content/B08G9PRS1K/metadata?response_groups=chapter_info'
		)
	})
})

describe('When checking asins', () => {
	it('returned true for a good asin', () => {
		expect(helper.checkAsinValidity(asin)).toBeTruthy()
	})

	it('returned false for a long asin', () => {
		expect(helper.checkAsinValidity('B08G9PRS1K' + '1')).toBeFalsy()
	})

	it('returned false for an invalid asin', () => {
		expect(helper.checkAsinValidity('B08G9PRS1+')).toBeFalsy()
	})
})
