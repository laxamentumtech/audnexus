import { Chapter } from '#config/typing/audible'
import { ApiChapter } from '#config/typing/books'
import ChapterHelper from '#helpers/books/audible/ChapterHelper'
import {
	chapterParsed1721358595,
	chapterResponseB017V4IM1G
} from '#tests/datasets/audible/books/chapter'

let asin: string
let helper: ChapterHelper

// Run through known book data to test responses
describe('Audible API', () => {
	describe('When fetching Project Hail Mary chapters', () => {
		let response: Chapter
		beforeAll(async () => {
			asin = 'B017V4IM1G'
			helper = new ChapterHelper(asin)
			const fetched = await helper.fetchChapter()
			if (!fetched) throw new Error('Parsed is undefined')
			response = fetched
		})

		it('returned the correct data', () => {
			expect(response).toEqual(chapterResponseB017V4IM1G)
		})
	})

	// Run through chapter parsing of a book with bad names
	describe('When parsing The Seep', () => {
		let response: ApiChapter
		beforeAll(async () => {
			asin = '1721358595'
			helper = new ChapterHelper(asin)
			const fetched = await helper.fetchChapter()
			const parsed = await helper.parseResponse(fetched)
			if (!parsed) throw new Error('Parsed is undefined')
			response = parsed
		})

		it('returned the correct data', () => {
			expect(response).toEqual(chapterParsed1721358595)
		})
	})

	describe("When fetching a broken ASIN's chapters", () => {
		let response: ApiChapter | undefined
		beforeAll(async () => {
			asin = 'B0036I54I6'
			helper = new ChapterHelper(asin)
			const fetched = await helper.fetchChapter()
			const parsed = await helper.parseResponse(fetched)
			response = parsed
		})

		it('returned undefined', () => {
			expect(response).toBeUndefined()
		})
	})
})
