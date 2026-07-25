import type { ApiChapter, AudibleChapter } from '#config/types'
import ChapterHelper from '#helpers/books/audible/ChapterHelper'

/**
 * Check if credentials are available for chapter API tests
 */
function hasCredentials(): boolean {
	return !!process.env.ADP_TOKEN && !!process.env.PRIVATE_KEY
}

/**
 * Helper to check if chapter response has expected structure
 */
function checkChapterStructure(response: AudibleChapter | undefined): {
	valid: boolean
	warnings: string[]
} {
	const warnings: string[] = []

	if (!response) {
		return { valid: false, warnings: ['Response is undefined'] }
	}

	if (!response.content_metadata) {
		warnings.push("[AUDIBLE API CHANGE] Missing 'content_metadata' in chapter response")
	}

	if (!response.content_metadata?.chapter_info) {
		warnings.push("[AUDIBLE API CHANGE] Missing 'chapter_info' in chapter response")
	}

	if (response.content_metadata?.chapter_info?.chapters) {
		const chapters = response.content_metadata.chapter_info.chapters
		if (!Array.isArray(chapters)) {
			warnings.push("[AUDIBLE API CHANGE] 'chapters' is not an array")
		}
	} else {
		warnings.push("[AUDIBLE API CHANGE] Missing 'chapters' array in chapter_info")
	}

	return { valid: warnings.length === 0, warnings }
}

// Skip all tests if credentials are not available
const describeOrSkip = hasCredentials() ? describe : describe.skip

describeOrSkip('Audible Chapter API Live Tests', () => {
	describe('When fetching Harry Potter chapters (B017V4IM1G)', () => {
		let response: AudibleChapter | undefined
		let structureCheck: ReturnType<typeof checkChapterStructure>

		beforeAll(async () => {
			const helper = new ChapterHelper('B017V4IM1G', 'us')
			response = await helper.fetchChapter()
			structureCheck = checkChapterStructure(response)
			for (const warning of structureCheck.warnings) {
				console.warn(warning)
			}
		}, 30000)

		it('should return valid chapter response', () => {
			expect(response).toBeDefined()
		})

		it('should have valid chapter structure', () => {
			expect(structureCheck.valid).toBe(true)
			expect(structureCheck.warnings).toEqual([])
		})

		it('should have chapter_info in content_metadata', () => {
			expect(response?.content_metadata).toBeDefined()
			expect(response?.content_metadata?.chapter_info).toBeDefined()
		})

		it('should have chapters array', () => {
			const chapters = response?.content_metadata?.chapter_info?.chapters
			expect(chapters).toBeDefined()
			expect(Array.isArray(chapters)).toBe(true)
			if (chapters) {
				expect(chapters.length).toBeGreaterThan(0)
			}
		})

		it('should have chapter titles', () => {
			const chapters = response?.content_metadata?.chapter_info?.chapters
			if (chapters && chapters.length > 0) {
				expect(chapters[0].title).toBeDefined()
				expect(typeof chapters[0].title).toBe('string')
			}
		})

		it('should have chapter timing information', () => {
			const chapters = response?.content_metadata?.chapter_info?.chapters
			if (chapters && chapters.length > 0) {
				expect(typeof chapters[0].length_ms).toBe('number')
				expect(typeof chapters[0].start_offset_ms).toBe('number')
				expect(typeof chapters[0].start_offset_sec).toBe('number')
			}
		})

		it('should have runtime information', () => {
			const chapterInfo = response?.content_metadata?.chapter_info
			expect(chapterInfo?.runtime_length_ms).toBeDefined()
			expect(chapterInfo?.runtime_length_sec).toBeDefined()
		})

		it('should have brand intro/outro information', () => {
			const chapterInfo = response?.content_metadata?.chapter_info
			expect(typeof chapterInfo?.brandIntroDurationMs).toBe('number')
			expect(typeof chapterInfo?.brandOutroDurationMs).toBe('number')
		})

		it('should have is_accurate flag', () => {
			const chapterInfo = response?.content_metadata?.chapter_info
			expect(typeof chapterInfo?.is_accurate).toBe('boolean')
		})
	})

	describe('When parsing chapter response', () => {
		let parsedResponse: ApiChapter | undefined

		beforeAll(async () => {
			const helper = new ChapterHelper('B017V4IM1G', 'us')
			const fetched = await helper.fetchChapter()
			parsedResponse = await helper.parseResponse(fetched)
		}, 30000)

		it('should successfully parse to ApiChapter format', () => {
			if (parsedResponse) {
				expect(parsedResponse.asin).toBe('B017V4IM1G')
			}
		})

		it('should have parsed chapters array', () => {
			if (parsedResponse) {
				expect(Array.isArray(parsedResponse.chapters)).toBe(true)
				expect(parsedResponse.chapters.length).toBeGreaterThan(0)
			}
		})

		it('should have region information', () => {
			if (parsedResponse) {
				expect(parsedResponse.region).toBe('us')
			}
		})

		it('should have runtime length', () => {
			if (parsedResponse) {
				expect(typeof parsedResponse.runtimeLengthMs).toBe('number')
				expect(typeof parsedResponse.runtimeLengthSec).toBe('number')
			}
		})
	})

	describe('When fetching chapters with different regions', () => {
		it('should fetch from UK region', async () => {
			const helper = new ChapterHelper('B017V4IM1G', 'uk')
			const response = await helper.fetchChapter()
			expect(response).toBeDefined()
		}, 30000)

		it('should fetch from AU region', async () => {
			const helper = new ChapterHelper('B017V4IM1G', 'au')
			const response = await helper.fetchChapter()
			expect(response).toBeDefined()
		}, 30000)
	})
})

// Log skip message if credentials are not available
if (!hasCredentials()) {
	console.log(
		'[SKIP] Chapter live tests skipped: ADP_TOKEN and PRIVATE_KEY environment variables not set'
	)
}
