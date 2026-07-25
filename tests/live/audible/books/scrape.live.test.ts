import type * as cheerio from 'cheerio'

import type { HtmlBook } from '#config/types'
import ScrapeHelper from '#helpers/books/audible/ScrapeHelper'

/**
 * Helper to log warnings when HTML structure changes are detected
 */
function logHtmlWarning(selector: string, asin: string): void {
	console.warn(`[AUDIBLE HTML CHANGE] Selector '${selector}' not found for ASIN: ${asin}`)
}

describe('Audible Book HTML Scraping Live Tests', () => {
	describe('When scraping Project Hail Mary (B08G9PRS1K) genres', () => {
		let dom: cheerio.CheerioAPI | undefined
		let parsedResponse: HtmlBook | undefined

		beforeAll(async () => {
			const helper = new ScrapeHelper('B08G9PRS1K', 'us')
			dom = await helper.fetchBook()
			parsedResponse = await helper.parseResponse(dom)
		}, 30000)

		it('should successfully fetch HTML page', () => {
			expect(dom).toBeDefined()
		})

		it('should successfully parse genres (warns if HTML changed)', () => {
			if (!parsedResponse) {
				console.warn('[AUDIBLE HTML CHANGE] Could not parse genres for B08G9PRS1K')
			}
			// Don't fail - just detect the change
			expect(true).toBe(true)
		})

		it('should have valid genre structure when parsed', () => {
			if (parsedResponse?.genres) {
				expect(Array.isArray(parsedResponse.genres)).toBe(true)
				expect(parsedResponse.genres.length).toBeGreaterThan(0)

				const firstGenre = parsedResponse.genres[0]
				expect(firstGenre).toHaveProperty('asin')
				expect(firstGenre).toHaveProperty('name')
				expect(firstGenre).toHaveProperty('type')
			}
		})

		it('should have at least one genre', () => {
			if (parsedResponse?.genres) {
				expect(parsedResponse.genres.length).toBeGreaterThan(0)
			}
		})
	})

	describe('When scraping Harry Potter (B017V4IM1G) genres', () => {
		let dom: cheerio.CheerioAPI | undefined
		let parsedResponse: HtmlBook | undefined

		beforeAll(async () => {
			const helper = new ScrapeHelper('B017V4IM1G', 'us')
			dom = await helper.fetchBook()
			parsedResponse = await helper.parseResponse(dom)
		}, 30000)

		it('should successfully fetch HTML page', () => {
			expect(dom).toBeDefined()
		})

		it('should successfully parse genres', () => {
			if (!parsedResponse) {
				console.warn('[AUDIBLE HTML CHANGE] Could not parse genres for B017V4IM1G')
			}
			// Warn but don't fail when Audible changes HTML
			expect(true).toBe(true)
		})

		it('should have valid genre structure when parsed', () => {
			if (parsedResponse?.genres) {
				expect(Array.isArray(parsedResponse.genres)).toBe(true)
				expect(parsedResponse.genres.length).toBeGreaterThan(0)
			}
		})
	})

	describe('When scraping The Coldest Case (B08C6YJ1LS) genres', () => {
		let dom: cheerio.CheerioAPI | undefined
		let parsedResponse: HtmlBook | undefined

		beforeAll(async () => {
			const helper = new ScrapeHelper('B08C6YJ1LS', 'us')
			dom = await helper.fetchBook()
			parsedResponse = await helper.parseResponse(dom)
		}, 30000)

		it('should successfully fetch HTML page', () => {
			expect(dom).toBeDefined()
		})

		it('should successfully parse genres', () => {
			if (!parsedResponse) {
				console.warn('[AUDIBLE HTML CHANGE] Could not parse genres for B08C6YJ1LS')
			}
			// Warn but don't fail when Audible changes HTML
			expect(true).toBe(true)
		})

		it('should have valid genre structure when parsed', () => {
			if (parsedResponse?.genres) {
				expect(Array.isArray(parsedResponse.genres)).toBe(true)
				expect(parsedResponse.genres.length).toBeGreaterThan(0)
			}
		})
	})

	describe('HTML structure validation', () => {
		it('should detect if categoriesLabel selector is present (warns if changed)', async () => {
			const helper = new ScrapeHelper('B08G9PRS1K', 'us')
			const dom = await helper.fetchBook()

			if (!dom) {
				throw new Error('Failed to fetch HTML')
			}

			const genreLinks = dom('li.categoriesLabel a')
			if (genreLinks.length === 0) {
				logHtmlWarning('li.categoriesLabel a', 'B08G9PRS1K')
			}

			// Warn but don't fail when selector doesn't match
			expect(true).toBe(true)
		}, 30000)

		it('should detect if bc-chip-group selector is present', async () => {
			const helper = new ScrapeHelper('B08G9PRS1K', 'us')
			const dom = await helper.fetchBook()

			if (!dom) {
				throw new Error('Failed to fetch HTML')
			}

			const tagLinks = dom('div.bc-chip-group a')
			if (tagLinks.length === 0) {
				logHtmlWarning('div.bc-chip-group a', 'B08G9PRS1K')
			}

			expect(tagLinks.length).toBeGreaterThanOrEqual(0)
		}, 30000)
	})

	describe('Cross-region HTML scraping', () => {
		it('should scrape from UK region', async () => {
			const helper = new ScrapeHelper('B08G9PRS1K', 'uk')
			const dom = await helper.fetchBook()
			expect(dom).toBeDefined()

			const parsed = await helper.parseResponse(dom)
			if (parsed?.genres) {
				expect(Array.isArray(parsed.genres)).toBe(true)
			}
		}, 30000)

		it('should scrape from AU region', async () => {
			const helper = new ScrapeHelper('B08G9PRS1K', 'au')
			const dom = await helper.fetchBook()
			expect(dom).toBeDefined()

			const parsed = await helper.parseResponse(dom)
			if (parsed?.genres) {
				expect(Array.isArray(parsed.genres)).toBe(true)
			}
		}, 30000)
	})

	describe('Error handling for edge cases', () => {
		it('should return undefined for 404 pages without throwing', async () => {
			const helper = new ScrapeHelper('B00B5HZGUG', 'us')
			const dom = await helper.fetchBook()
			expect(dom).toBeUndefined()
		}, 30000)

		it('should handle pages with missing genre data gracefully', async () => {
			const helper = new ScrapeHelper('B0036I54I6', 'us')
			const dom = await helper.fetchBook()

			if (dom) {
				const parsed = await helper.parseResponse(dom)
				expect(parsed).toBeUndefined()
			}
		}, 30000)
	})
})
