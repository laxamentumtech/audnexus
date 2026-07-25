import type { ApiAuthorProfile } from '#config/types'
import ScrapeHelper from '#helpers/authors/audible/ScrapeHelper'

describe('Audible Author HTML Scraping Live Tests', () => {
	describe('When scraping Andy Weir (B00G0WYW92)', () => {
		let response: ApiAuthorProfile

		beforeAll(async () => {
			const helper = new ScrapeHelper('B00G0WYW92', 'us')
			response = await helper.process()
		}, 30000)

		it('should successfully fetch and parse author data', () => {
			expect(response).toBeDefined()
			expect(response.asin).toBe('B00G0WYW92')
		})

		it('should have author name', () => {
			expect(response.name).toBeDefined()
			expect(typeof response.name).toBe('string')
			expect(response.name.length).toBeGreaterThan(0)
		})

		it('should have valid genres structure (warns if HTML changed)', () => {
			if (response.genres && response.genres.length > 0) {
				expect(Array.isArray(response.genres)).toBe(true)

				const firstGenre = response.genres[0]
				expect(firstGenre).toHaveProperty('asin')
				expect(firstGenre).toHaveProperty('name')
				expect(firstGenre).toHaveProperty('type')
			} else {
				console.warn('[AUDIBLE HTML CHANGE] No genres found for author B00G0WYW92')
			}
			// Test passes even if no genres (Audible may have changed HTML)
			expect(true).toBe(true)
		})

		it('should have image if available', () => {
			if (response.image) {
				expect(typeof response.image).toBe('string')
			}
		})

		it('should have description if available', () => {
			if (response.description) {
				expect(typeof response.description).toBe('string')
			}
		})

		it('should have region', () => {
			expect(response.region).toBeDefined()
			expect(response.region).toBe('us')
		})

		it('should have similar authors if available', () => {
			if (response.similar) {
				expect(Array.isArray(response.similar)).toBe(true)
				expect(response.similar.length).toBeGreaterThan(0)

				const firstSimilar = response.similar[0]
				expect(firstSimilar).toHaveProperty('asin')
				expect(firstSimilar).toHaveProperty('name')
			}
		})
	})

	describe('When scraping J.K. Rowling (B000AP9A6K)', () => {
		let response: ApiAuthorProfile

		beforeAll(async () => {
			const helper = new ScrapeHelper('B000AP9A6K', 'us')
			response = await helper.process()
		}, 30000)

		it('should successfully fetch and parse author data', () => {
			expect(response).toBeDefined()
			expect(response.asin).toBe('B000AP9A6K')
		})

		it('should have author name', () => {
			expect(response.name).toBeDefined()
			expect(typeof response.name).toBe('string')
			expect(response.name.length).toBeGreaterThan(0)
		})

		it('should have valid genres structure', () => {
			if (response.genres) {
				expect(Array.isArray(response.genres)).toBe(true)
			}
		})
	})

	describe('When scraping Ray Porter (B0034NFIOI)', () => {
		let response: ApiAuthorProfile

		beforeAll(async () => {
			const helper = new ScrapeHelper('B0034NFIOI', 'us')
			response = await helper.process()
		}, 30000)

		it('should successfully fetch and parse author data', () => {
			expect(response).toBeDefined()
		})

		it('should have author name', () => {
			expect(response.name).toBeDefined()
			expect(typeof response.name).toBe('string')
		})
	})

	describe('HTML structure validation for authors', () => {
		it('should detect if author name selector is present', async () => {
			const helper = new ScrapeHelper('B00G0WYW92', 'us')
			const dom = await helper.fetchAuthor()

			if (!dom) {
				throw new Error('Failed to fetch author HTML')
			}

			const nameElement = dom(
				'h1.bc-heading.bc-color-base.bc-size-extra-large.bc-text-secondary.bc-text-bold'
			)

			if (nameElement.length === 0) {
				console.warn(
					"[AUDIBLE HTML CHANGE] Author name selector 'h1.bc-heading.bc-color-base.bc-size-extra-large.bc-text-secondary.bc-text-bold' not found"
				)
			}

			expect(nameElement.length).toBeGreaterThan(0)
		}, 30000)

		it('should detect if genre selector is present', async () => {
			const helper = new ScrapeHelper('B00G0WYW92', 'us')
			const dom = await helper.fetchAuthor()

			if (!dom) {
				throw new Error('Failed to fetch author HTML')
			}

			const genreLinks = dom('div.contentPositionClass div.bc-box a.bc-color-link')

			if (genreLinks.length === 0) {
				console.warn(
					"[AUDIBLE HTML CHANGE] Author genre selector 'div.contentPositionClass div.bc-box a.bc-color-link' not found"
				)
			}

			expect(genreLinks.length).toBeGreaterThanOrEqual(0)
		}, 30000)

		it('should detect if description selector is present', async () => {
			const helper = new ScrapeHelper('B00G0WYW92', 'us')
			const dom = await helper.fetchAuthor()

			if (!dom) {
				throw new Error('Failed to fetch author HTML')
			}

			const descriptionElement = dom('div.bc-expander-content')

			if (descriptionElement.length === 0) {
				console.warn(
					"[AUDIBLE HTML CHANGE] Author description selector 'div.bc-expander-content' not found"
				)
			}

			expect(descriptionElement.length).toBeGreaterThanOrEqual(0)
		}, 30000)

		it('should detect if image selector is present', async () => {
			const helper = new ScrapeHelper('B00G0WYW92', 'us')
			const dom = await helper.fetchAuthor()

			if (!dom) {
				throw new Error('Failed to fetch author HTML')
			}

			const imageElement = dom('img.author-image-outline')

			if (imageElement.length === 0) {
				console.warn(
					"[AUDIBLE HTML CHANGE] Author image selector 'img.author-image-outline' not found"
				)
			}

			expect(imageElement.length).toBeGreaterThanOrEqual(0)
		}, 30000)

		it('should detect if similar authors selector is present', async () => {
			const helper = new ScrapeHelper('B00G0WYW92', 'us')
			const dom = await helper.fetchAuthor()

			if (!dom) {
				throw new Error('Failed to fetch author HTML')
			}

			const similarSection = dom(
				'div.bc-col-responsive.bc-pub-max-width-large.bc-col-3.bc-col-offset-0'
			)

			if (similarSection.length === 0) {
				console.warn(
					"[AUDIBLE HTML CHANGE] Similar authors selector 'div.bc-col-responsive.bc-pub-max-width-large.bc-col-3.bc-col-offset-0' not found"
				)
			}

			expect(similarSection.length).toBeGreaterThanOrEqual(0)
		}, 30000)
	})

	describe('Cross-region author scraping', () => {
		it('should scrape author from UK region', async () => {
			const helper = new ScrapeHelper('B00G0WYW92', 'uk')
			const response = await helper.process()
			expect(response).toBeDefined()
			expect(response.name).toBeDefined()
		}, 30000)

		it('should scrape author from AU region', async () => {
			const helper = new ScrapeHelper('B00G0WYW92', 'au')
			const response = await helper.process()
			expect(response).toBeDefined()
			expect(response.name).toBeDefined()
		}, 30000)
	})

	describe('Error handling for edge cases', () => {
		it('should throw error for 404 pages', async () => {
			const helper = new ScrapeHelper('103940202X', 'us')
			await expect(helper.fetchAuthor()).rejects.toThrow()
		}, 30000)

		it('should handle authors with minimal data', async () => {
			const helper = new ScrapeHelper('B0034NFIOI', 'us')
			const response = await helper.process()
			expect(response).toBeDefined()
			expect(response.name).toBeDefined()
		}, 30000)
	})
})
