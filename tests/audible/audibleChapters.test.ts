import ChapterHelper from '../../src/helpers/audibleChapter'
import { ChapterInterface } from '../../src/interfaces/audible'

// Run through known book data to test responses
const asinProjectHailMary: string = 'B08G9PRS1K'
const chapProjectHailMary = new ChapterHelper(asinProjectHailMary)

describe('When fetching Project Hail Mary chapters from Audible API', () => {
    let response: ChapterInterface
    beforeAll((done) => {
        chapProjectHailMary.fetchBook().then(result => {
            response = result
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
        expect(response.content_metadata.chapter_info.chapters[0]['length_ms']).toBe(13307)
    })

    it('returned chapter #1 start_offset_ms', () => {
        expect(response.content_metadata.chapter_info.chapters[0]['start_offset_ms']).toBe(0)
    })

    it('returned chapter #1 start_offset_sec', () => {
        expect(response.content_metadata.chapter_info.chapters[0]['start_offset_sec']).toBe(0)
    })

    it('returned chapter #1 title', () => {
        expect(response.content_metadata.chapter_info.chapters[0]['title']).toBe('Opening Credits')
    })

    it('returned chapter #30 length', () => {
        expect(response.content_metadata.chapter_info.chapters[31]['length_ms']).toBe(838616)
    })

    it('returned chapter #30 start_offset_ms', () => {
        expect(response.content_metadata.chapter_info.chapters[31]['start_offset_ms']).toBe(57371288)
    })

    it('returned chapter #30 start_offset_sec', () => {
        expect(response.content_metadata.chapter_info.chapters[31]['start_offset_sec']).toBe(57371)
    })

    it('returned chapter #30 title', () => {
        expect(response.content_metadata.chapter_info.chapters[31]['title']).toBe('Chapter 30')
    })
})
