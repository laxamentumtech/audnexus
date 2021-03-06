import { Chapter } from '#config/typing/audible'
import { ApiChapter } from '#config/typing/books'
import ChapterHelper from '#helpers/books/audible/ChapterHelper'

// Run through known book data to test responses
const asinProjectHailMary = 'B08G9PRS1K'
const chapProjectHailMary = new ChapterHelper(asinProjectHailMary)

describe('When fetching Project Hail Mary chapters from Audible API', () => {
	let response: Chapter
	beforeAll((done) => {
		chapProjectHailMary.fetchChapter().then((result) => {
			response = result!
			done()
		})
	})

	it('returned 32 chapters', () => {
		expect(response.content_metadata.chapter_info.chapters.length).toBe(33)
	})

	it('returned brandIntroDurationMs', () => {
		expect(response.content_metadata.chapter_info.brandIntroDurationMs).toBe(2043)
	})

	it('returned brandOutroDurationMs', () => {
		expect(response.content_metadata.chapter_info.brandOutroDurationMs).toBe(5061)
	})

	it('returned isAccurate', () => {
		expect(response.content_metadata.chapter_info.is_accurate).toBe(true)
	})

	it('returned runtimeLengthMs', () => {
		expect(response.content_metadata.chapter_info.runtime_length_ms).toBe(58252995)
	})

	it('returned runtimeLengthSec', () => {
		expect(response.content_metadata.chapter_info.runtime_length_sec).toBe(58253)
	})

	it('returned chapter #1 length', () => {
		expect(response.content_metadata.chapter_info.chapters[0].length_ms).toBe(13307)
	})

	it('returned chapter #1 start_offset_ms', () => {
		expect(response.content_metadata.chapter_info.chapters[0].start_offset_ms).toBe(0)
	})

	it('returned chapter #1 start_offset_sec', () => {
		expect(response.content_metadata.chapter_info.chapters[0].start_offset_sec).toBe(0)
	})

	it('returned chapter #1 title', () => {
		expect(response.content_metadata.chapter_info.chapters[0].title).toBe('Opening Credits')
	})

	it('returned chapter #30 length', () => {
		expect(response.content_metadata.chapter_info.chapters[31].length_ms).toBe(838616)
	})

	it('returned chapter #30 start_offset_ms', () => {
		expect(response.content_metadata.chapter_info.chapters[31].start_offset_ms).toBe(57371288)
	})

	it('returned chapter #30 start_offset_sec', () => {
		expect(response.content_metadata.chapter_info.chapters[31].start_offset_sec).toBe(57371)
	})

	it('returned chapter #30 title', () => {
		expect(response.content_metadata.chapter_info.chapters[31].title).toBe('Chapter 30')
	})
})

// Run through chapter parsing of a book with bad names
const asinTheSeep = '1721358595'

describe('When parsing The Seep', () => {
	let response: ApiChapter
	beforeAll(async () => {
		// Setup helpers
		const chapterHelper = new ChapterHelper(asinTheSeep)
		// Run helpers
		const chapterData = await chapterHelper.process()
		// Set variables
		if (!chapterData) throw new Error('No chapter data')
		response = chapterData
	})

	it('returned 32 chapters', () => {
		expect(response.chapters.length).toBe(26)
	})

	it('returned brandIntroDurationMs', () => {
		expect(response.brandIntroDurationMs).toBe(2043)
	})

	it('returned brandOutroDurationMs', () => {
		expect(response.brandOutroDurationMs).toBe(5061)
	})

	it('returned isAccurate', () => {
		expect(response.isAccurate).toBe(true)
	})

	it('returned runtimeLengthMs', () => {
		expect(response.runtimeLengthMs).toBe(11087747)
	})

	it('returned runtimeLengthSec', () => {
		expect(response.runtimeLengthSec).toBe(11088)
	})

	it('returned chapter #4 length', () => {
		expect(response.chapters[3].lengthMs).toBe(7448)
	})

	it('returned chapter #4 start_offset_ms', () => {
		expect(response.chapters[3].startOffsetMs).toBe(139180)
	})

	it('returned chapter #4 start_offset_sec', () => {
		expect(response.chapters[3].startOffsetSec).toBe(139)
	})

	it('returned chapter #4 title', () => {
		expect(response.chapters[3].title).toBe('Part One: The Softest Invasion')
	})

	it('returned chapter #18 length', () => {
		expect(response.chapters[23].lengthMs).toBe(223190)
	})

	it('returned chapter #18 startOffsetMs', () => {
		expect(response.chapters[23].startOffsetMs).toBe(10171073)
	})

	it('returned chapter #18 startOffsetSec', () => {
		expect(response.chapters[23].startOffsetSec).toBe(10171)
	})

	it('returned chapter #18 title', () => {
		expect(response.chapters[23].title).toBe('Chapter 18')
	})
})

// Test known BAD returns
const asinBad = 'B0036I54I6'

describe("When fetching an broken ASIN's chapters from Audible API", () => {
	let response: ApiChapter | undefined
	beforeAll(async () => {
		// Setup helpers
		const chapterHelper = new ChapterHelper(asinBad)
		// Run helpers
		const chapterData = await chapterHelper.process()
		// Set variables
		response = chapterData
	})

	it('returned undefined', () => {
		expect(response).toBeUndefined()
	})
})
