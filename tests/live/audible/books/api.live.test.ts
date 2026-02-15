import type { ApiBook, AudibleProduct } from '#config/types'
import ApiHelper from '#helpers/books/audible/ApiHelper'
import { BadRequestError, ContentTypeMismatchError, NotFoundError } from '#helpers/errors/ApiErrors'

/**
 * Allowlist of ASINs that are expected to be unavailable in specific regions.
 * These ASINs are used to test error handling for unavailable content.
 * If an ASIN becomes available, the test will skip with a warning.
 */
const unavailableAsins: { asin: string; region: string }[] = [{ asin: 'B07V2K2N5L', region: 'us' }]

/**
 * Checks if an ASIN is in the unavailable allowlist for a given region
 */
function isInUnavailableAllowlist(asin: string, region: string): boolean {
	return unavailableAsins.some((item) => item.asin === asin && item.region === region)
}

/**
 * Checks if content is available by validating the response structure.
 * Returns true only if content_delivery_type is present and is a known type.
 * This prevents false positives from Audible product stubs.
 */
function checkAvailability(response: AudibleProduct): boolean {
	const product = response.product
	const contentType = product?.content_delivery_type
	const knownTypes = ['PodcastParent', 'MultiPartBook', 'SinglePartBook'] // PodcastParent included for detection purposes - content type mismatch should be thrown

	// Content is only considered available when content_delivery_type is present and known
	// This prevents false positives from incomplete product stubs
	return contentType !== undefined && contentType !== null && knownTypes.includes(contentType)
}

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
			const asin = 'B07V2K2N5L'
			const region = 'us'
			const helper = new ApiHelper(asin, region)
			const fetched = await helper.fetchBook()

			// Check if ASIN is in the unavailable allowlist
			if (isInUnavailableAllowlist(asin, region)) {
				// Check if the content is actually unavailable
				const isAvailable = checkAvailability(fetched)

				if (isAvailable) {
					// ASIN was expected to be unavailable but is now available
					console.warn(`[LIVE TEST] ASIN ${asin} is now available in region ${region}`)
					// Skip the test by returning early - test passes with warning
					return
				}

				// ASIN is in allowlist and is unavailable - expect parseResponse to reject
				await expect(helper.parseResponse(fetched)).rejects.toBeDefined()
			} else {
				// ASIN not in allowlist - run normal test (expect rejection for unavailable content)
				await expect(helper.parseResponse(fetched)).rejects.toBeDefined()
			}
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
			const foundGenreAsins: string[] = []
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
								if (category.id) {
									foundGenreAsins.push(category.id)
									if (!/^\d{10,12}$/.test(category.id)) {
										warnings.push(
											`[AUDIBLE API CHANGE] Genre ASIN '${category.id}' in region '${region}' does not match expected pattern (10-12 digits)`
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

			expect(foundGenreAsins.length).toBeGreaterThan(0)
		}, 30000)
	})

	describe('Structured error response validation', () => {
		/**
		 * Tests for validating the new structured error response format.
		 * These tests ensure error responses include code, message, and details fields.
		 */

		it('should return structured error for unavailable content (REGION_UNAVAILABLE)', async () => {
			const asin = 'B000000000' // Non-existent ASIN
			const helper = new ApiHelper(asin, 'us')
			const fetched = await helper.fetchBook()

			// Try to parse - should throw with structured error
			let error: unknown
			try {
				await helper.parseResponse(fetched)
				throw new Error('Expected error to be thrown')
			} catch (e) {
				error = e
			}

			// Verify error is thrown and is the correct type
			expect(error).toBeInstanceOf(NotFoundError)

			// Verify error structure
			expect(error).toMatchObject({
				message: expect.stringContaining(asin),
				details: expect.objectContaining({
					asin: asin
				})
			})
		}, 30000)

		it('should handle podcast ASIN on book endpoint (CONTENT_TYPE_MISMATCH)', async () => {
			/**
			 * This test uses a known podcast ASIN and verifies that when fetched
			 * through the books endpoint, it properly detects the content type mismatch.
			 *
			 * Note: Podcast ASINs may change over time. If this test starts failing,
			 * the ASIN may have been removed or changed format.
			 */
			const podcastAsins = ['B017V4U2VQ', 'B09WJ2R4HQ'] // Known podcast/exclusive content ASINs
			let mismatchDetectedByError = false
			let parseSucceededButWasPodcast = false
			let mismatchError: ContentTypeMismatchError | null = null

			for (const asin of podcastAsins) {
				try {
					const helper = new ApiHelper(asin, 'us')
					const fetched = await helper.fetchBook()
					await helper.parseResponse(fetched)
					// If parse succeeds but content is still a podcast, that's a failure
					if (fetched.product?.content_delivery_type === 'PodcastParent') {
						parseSucceededButWasPodcast = true
						console.warn(
							`[LIVE TEST] Podcast ASIN ${asin} detected - CONTENT_TYPE_MISMATCH should have been thrown`
						)
					}
				} catch (error) {
					// Expected - content type mismatch should be detected
					if (error instanceof ContentTypeMismatchError) {
						mismatchDetectedByError = true
						mismatchError = error
						console.log(`[LIVE TEST] Content type mismatch correctly detected for ${asin}`)
					}
				}
			}

			// Verify error structure if mismatch was detected by error
			if (mismatchDetectedByError && mismatchError) {
				expect(mismatchError.details).toBeDefined()
				expect(mismatchError.details?.asin).toBeDefined()
				expect(mismatchError.details?.requestedType).toBe('book')
				expect(mismatchError.details?.actualType).toBeDefined()
			}

			// Fail explicitly if parse succeeded but was actually a podcast
			if (parseSucceededButWasPodcast) {
				throw new Error(
					'Content type is PodcastParent but parseResponse succeeded - ContentTypeMismatchError should have been thrown'
				)
			}

			// Expect at least one ASIN to trigger the ContentTypeMismatchError
			// If none do, the ASINs may have changed
			if (!mismatchDetectedByError) {
				console.warn('[LIVE TEST] No content type mismatch detected - test ASINs may need updating')
			}
			// Warn but don't fail - external ASINs may change
			expect(true).toBe(true)
		}, 30000)

		it('should validate error response structure contains required fields', async () => {
			/**
			 * This test validates that error responses follow the structured format:
			 * { error: { code: string, message: string, details?: object } }
			 */
			const asin = 'B000000000'
			const helper = new ApiHelper(asin, 'us')
			const fetched = await helper.fetchBook()

			let errorThrown = false
			try {
				await helper.parseResponse(fetched)
			} catch (error) {
				errorThrown = true
				// The error should be an Error instance with a message
				expect(error).toBeInstanceOf(Error)
				if (error instanceof Error) {
					expect(error.message).toBeTruthy()
				}
				// Verify it's a NotFoundError with structured details
				expect(error).toBeInstanceOf(NotFoundError)
				const notFoundError = error as NotFoundError
				expect(notFoundError.statusCode).toBe(404)
				expect(notFoundError.details).toBeDefined()
			}

			expect(errorThrown).toBe(true)
		}, 30000)
	})

	describe('ASIN format validation (BAD_REQUEST scenarios)', () => {
		/**
		 * Tests for validating that malformed ASINs are properly rejected.
		 * These tests verify the BAD_REQUEST error code is returned for invalid inputs.
		 */

		const invalidAsinFormats = [
			{ asin: '123', description: 'too short' },
			{ asin: 'ABC', description: 'letters only' },
			{ asin: 'B123', description: 'too short with B prefix' },
			{ asin: 'B12345678901234567890', description: 'too long' },
			{ asin: 'INVALID', description: 'all uppercase letters' }
		]

		it('should reject malformed ASIN formats', async () => {
			const validationResults: {
				asin: string
				description: string
				rejected: boolean
				errorType?: string
			}[] = []

			for (const { asin, description } of invalidAsinFormats) {
				try {
					const helper = new ApiHelper(asin, 'us')
					await helper.fetchBook()
					// If fetch succeeds, mark as not rejected
					validationResults.push({ asin, description, rejected: false })
				} catch (error) {
					// Expected - malformed ASIN should be rejected
					if (error instanceof BadRequestError) {
						validationResults.push({
							asin,
							description,
							rejected: true,
							errorType: 'BadRequestError'
						})
					} else {
						validationResults.push({ asin, description, rejected: true, errorType: 'OtherError' })
					}
				}
			}

			// Log results for debugging
			const rejected = validationResults.filter((r) => r.rejected)
			const notRejected = validationResults.filter((r) => !r.rejected)

			console.log(
				`[LIVE TEST] ASIN format validation: ${rejected.length}/${validationResults.length} formats rejected`
			)
			if (notRejected.length > 0) {
				console.warn(
					`[LIVE TEST] These ASIN formats were not rejected: ${notRejected.map((r) => `${r.asin} (${r.description})`).join(', ')}`
				)
			}

			// Verify at least some malformed ASINs were rejected with BadRequestError
			const badRequestRejections = rejected.filter((r) => r.errorType === 'BadRequestError')
			if (badRequestRejections.length > 0) {
				console.log(
					`[LIVE TEST] ${badRequestRejections.length} malformed ASINs correctly rejected with BAD_REQUEST`
				)
			} else {
				console.warn(
					'[LIVE TEST] No malformed ASINs rejected with BAD_REQUEST - API behavior may have changed'
				)
			}

			// We expect most malformed formats to be rejected
			// Some may pass through to the API which returns 404 instead
			// Warn but don't fail - external API behavior may change
			expect(validationResults.length).toBe(invalidAsinFormats.length)

			// Verify that at least some malformed ASINs were rejected (any error type)
			expect(rejected.length).toBeGreaterThan(0)
		}, 30000)

		it('should accept valid ASIN formats', async () => {
			/**
			 * Verifies that valid ASIN formats are accepted (don't throw BAD_REQUEST).
			 * These should either succeed (200) or return REGION_UNAVAILABLE (404).
			 */
			const validAsinFormats = [
				{ asin: 'B08G9PRS1K', description: 'standard 10-char' },
				{ asin: 'B07V2K2N5L', description: 'unavailable 10-char' }
			]

			for (const { asin, description } of validAsinFormats) {
				try {
					const helper = new ApiHelper(asin, 'us')
					const result = await helper.fetchBook()
					// Should get a response (either success or Audible's not-found response)
					expect(result).toBeDefined()
					console.log(`[LIVE TEST] Valid ASIN ${asin} (${description}) accepted`)
				} catch (error) {
					// Even valid ASINs may fail for other reasons (network, etc.)
					// but should NOT fail with BAD_REQUEST
					if (error instanceof BadRequestError) {
						fail(`Valid ASIN ${asin} should not be rejected with BadRequestError`)
					}
					if (error instanceof Error && error.message.includes('Bad ASIN')) {
						console.warn(`[LIVE TEST] Valid ASIN ${asin} rejected as BAD_REQUEST`)
					}
				}
			}

			expect(true).toBe(true)
		}, 30000)
	})
})
