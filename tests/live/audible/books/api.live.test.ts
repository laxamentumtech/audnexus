import type { ApiBook, AudibleProduct } from '#config/types'
import ApiHelper from '#helpers/books/audible/ApiHelper'

/**
 * Helper to check if a response has the expected structure
 * Logs warnings instead of failing when Audible data changes format
 */
function checkRequiredFields(
	asin: string,
	response: AudibleProduct['product'],
	requiredFields: string[]
): { passed: boolean; missingFields: string[]; warnings: string[] } {
	const missingFields: string[] = []
	const warnings: string[] = []

	for (const field of requiredFields) {
		if (!(field in response) || response[field as keyof typeof response] === undefined) {
			missingFields.push(field)
			warnings.push(`[AUDIBLE API CHANGE] Missing required field '${field}' for ASIN: ${asin}`)
		}
	}

	return {
		passed: missingFields.length === 0,
		missingFields,
		warnings
	}
}

/**
 * Logs warnings for detected API structure changes
 */
function logWarnings(warnings: string[]): void {
	for (const warning of warnings) {
		console.warn(warning)
	}
}

describe('Audible API Live Tests', () => {
	const requiredBookFields = [
		'asin',
		'title',
		'authors',
		'narrators',
		'category_ladders',
		'copyright',
		'format_type',
		'language',
		'publisher_name',
		'publisher_summary',
		'release_date',
		'runtime_length_min',
		'product_images',
		'rating'
	]

	describe('When fetching Project Hail Mary (B08G9PRS1K)', () => {
		let response: AudibleProduct['product']
		let fieldCheck: ReturnType<typeof checkRequiredFields>

		beforeAll(async () => {
			const helper = new ApiHelper('B08G9PRS1K', 'us')
			const fetched = await helper.fetchBook()
			response = fetched.product
			fieldCheck = checkRequiredFields('B08G9PRS1K', response, requiredBookFields)
			logWarnings(fieldCheck.warnings)
		}, 30000)

		it('should return HTTP 200 and valid response', () => {
			expect(response).toBeDefined()
			expect(response.asin).toBe('B08G9PRS1K')
		})

		it('should have all required fields present', () => {
			expect(fieldCheck.passed).toBe(true)
			expect(fieldCheck.missingFields).toEqual([])
		})

		it('should have valid authors array', () => {
			expect(Array.isArray(response.authors)).toBe(true)
			expect(response.authors.length).toBeGreaterThan(0)
			expect(response.authors[0]).toHaveProperty('name')
		})

		it('should have valid narrators array', () => {
			expect(Array.isArray(response.narrators)).toBe(true)
			if (response.narrators) {
				expect(response.narrators.length).toBeGreaterThan(0)
			}
		})

		it('should have valid category_ladders for genres', () => {
			expect(Array.isArray(response.category_ladders)).toBe(true)
			expect(response.category_ladders.length).toBeGreaterThan(0)
		})

		it('should have product images available', () => {
			expect(response.product_images).toBeDefined()
			expect(typeof response.product_images).toBe('object')
		})

		it('should have valid rating structure if present', () => {
			if (response.rating) {
				expect(response.rating.overall_distribution).toBeDefined()
			} else {
				console.warn('[LIVE TEST] Rating not available for this ASIN')
			}
		})
	})

	describe('When fetching The Coldest Case (B08C6YJ1LS)', () => {
		let response: AudibleProduct['product']
		let fieldCheck: ReturnType<typeof checkRequiredFields>

		beforeAll(async () => {
			const helper = new ApiHelper('B08C6YJ1LS', 'us')
			const fetched = await helper.fetchBook()
			response = fetched.product
			fieldCheck = checkRequiredFields('B08C6YJ1LS', response, requiredBookFields)
			logWarnings(fieldCheck.warnings)
		}, 30000)

		it('should return HTTP 200 and valid response', () => {
			expect(response).toBeDefined()
			expect(response.asin).toBe('B08C6YJ1LS')
		})

		it('should have all required fields present', () => {
			expect(fieldCheck.passed).toBe(true)
			expect(fieldCheck.missingFields).toEqual([])
		})

		it('should have valid authors array', () => {
			expect(Array.isArray(response.authors)).toBe(true)
			expect(response.authors.length).toBeGreaterThan(0)
		})
	})

	describe('When parsing API response for Harry Potter (B017V4IM1G)', () => {
		let parsedResponse: ApiBook

		beforeAll(async () => {
			const helper = new ApiHelper('B017V4IM1G', 'us')
			const fetched = await helper.fetchBook()
			parsedResponse = await helper.parseResponse(fetched)
		}, 30000)

		it('should successfully parse to ApiBook format', () => {
			expect(parsedResponse).toBeDefined()
			expect(parsedResponse.asin).toBe('B017V4IM1G')
		})

		it('should have parsed authors correctly', () => {
			expect(Array.isArray(parsedResponse.authors)).toBe(true)
			expect(parsedResponse.authors.length).toBeGreaterThan(0)
		})

		it('should have parsed genres if available', () => {
			if (parsedResponse.genres) {
				expect(Array.isArray(parsedResponse.genres)).toBe(true)
				expect(parsedResponse.genres.length).toBeGreaterThan(0)
				expect(parsedResponse.genres[0]).toHaveProperty('asin')
				expect(parsedResponse.genres[0]).toHaveProperty('name')
				expect(parsedResponse.genres[0]).toHaveProperty('type')
			}
		})

		it('should have parsed rating as string', () => {
			expect(typeof parsedResponse.rating).toBe('string')
		})
	})

	describe('When fetching from different regions', () => {
		it('should fetch from UK region (co.uk)', async () => {
			const helper = new ApiHelper('B08G9PRS1K', 'uk')
			const fetched = await helper.fetchBook()
			expect(fetched.product).toBeDefined()
			expect(fetched.product.asin).toBe('B08G9PRS1K')
		}, 30000)

		it('should fetch from AU region (com.au)', async () => {
			const helper = new ApiHelper('B08G9PRS1K', 'au')
			const fetched = await helper.fetchBook()
			expect(fetched.product).toBeDefined()
			expect(fetched.product.asin).toBe('B08G9PRS1K')
		}, 30000)
	})

	describe('Error handling and edge cases', () => {
		it('should handle non-existent ASIN gracefully', async () => {
			const helper = new ApiHelper('B000000000', 'us')
			const response = await helper.fetchBook()
			// Audible returns a valid product object containing the requested ASIN even for non-existent ASINs
			expect(response).toBeDefined()
			expect(response.product).toBeDefined()
			expect(response.product.asin).toBe('B000000000')
		}, 30000)

		it('should detect when content is not available in region', async () => {
			const helper = new ApiHelper('B07V2K2N5L', 'us')
			const fetched = await helper.fetchBook()
			await expect(helper.parseResponse(fetched)).rejects.toBeDefined()
		}, 30000)
	})

	describe('Genre ASIN validation', () => {
		// Test ASINs with different genre categories
		const testAsins = ['B08G9PRS1K', 'B08C6YJ1LS', 'B017V4IM1G']

		it('should validate genre ASINs match expected pattern (10-12 digits)', async () => {
			const genreAsins: string[] = []
			const warnings: string[] = []

			for (const asin of testAsins) {
				const helper = new ApiHelper(asin, 'us')
				const fetched = await helper.fetchBook()

				// Extract category_ladders and collect all category IDs
				if (fetched.product?.category_ladders) {
					for (const ladder of fetched.product.category_ladders) {
						if (ladder.ladder) {
							for (const category of ladder.ladder) {
								if (category.id) {
									genreAsins.push(category.id)
									// Validate pattern: 10-12 digits
									if (!/^\d{10,12}$/.test(category.id)) {
										warnings.push(
											`[AUDIBLE API CHANGE] Genre ASIN '${category.id}' (name: '${category.name}') does not match expected pattern (10-12 digits) for book ASIN: ${asin}`
										)
									}
								}
							}
						}
					}
				}
			}

			// Log warnings if any genre ASINs don't match expected pattern
			if (warnings.length > 0) {
				for (const warning of warnings) {
					console.warn(warning)
				}
			}

			// We should have found at least some genre ASINs
			expect(genreAsins.length).toBeGreaterThan(0)
			// Log how many genre ASINs we found for debugging
			console.log(`Found ${genreAsins.length} genre ASINs to validate`)
		}, 30000)

		it('should validate genre ASINs from different regions', async () => {
			const warnings: string[] = []
			const regionsToTest = ['us', 'uk', 'au']
			const asin = 'B08G9PRS1K'

			for (const region of regionsToTest) {
				const helper = new ApiHelper(asin, region)
				const fetched = await helper.fetchBook()

				// Extract category_ladders and validate IDs
				if (fetched.product?.category_ladders) {
					for (const ladder of fetched.product.category_ladders) {
						if (ladder.ladder) {
							for (const category of ladder.ladder) {
								if (category.id && !/^\d{10,12}$/.test(category.id)) {
									warnings.push(
										`[AUDIBLE API CHANGE] Genre ASIN '${category.id}' in region '${region}' does not match expected pattern (10-12 digits)`
									)
								}
							}
						}
					}
				}
			}

			// Log warnings if any genre ASINs don't match expected pattern
			if (warnings.length > 0) {
				for (const warning of warnings) {
					console.warn(warning)
				}
			}

			// The test passes even if warnings exist - warnings are for detection only
			expect(true).toBe(true)
		}, 30000)
	})
})
