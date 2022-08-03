import { ApiChapter, Book } from '#config/typing/books'
import ChapterHelper from '#helpers/books/audible/ChapterHelper'
import StitchHelper from '#helpers/books/audible/StitchHelper'
import { minimalB0036I54I6 } from '#tests/datasets/audible/books/api'
import {
	chapterResponseB08C6YJ1LS,
	chapterResponseB017V4IM1G,
	setupParsedChapter
} from '#tests/datasets/audible/books/chapter'
import { combinedB08C6YJ1LS, combinedB017V4IM1G } from '#tests/datasets/audible/books/stitch'

let asin: string
let helper: StitchHelper
let chapterHelper: ChapterHelper
let response: Book
let chapters: ApiChapter | undefined

describe('Audible API and HTML Parsing', () => {
	describe('When stitching together Scorcerers Stone', () => {
		beforeAll(async () => {
			asin = 'B017V4IM1G'
			// Setup helpers
			chapterHelper = new ChapterHelper(asin)
			helper = new StitchHelper(asin)
			// Run helpers
			const chapterData = await chapterHelper.process()
			const newBook = await helper.process()
			// Set variables
			chapters = chapterData
			response = newBook
		})

		it('returned the correct data', () => {
			expect(response).toEqual(combinedB017V4IM1G)
		})

		it('returned the correct chapters', () => {
			expect(chapters).toEqual(setupParsedChapter(chapterResponseB017V4IM1G, asin))
		})
	})

	describe('When stitching together The Coldest Case', () => {
		beforeAll(async () => {
			asin = 'B08C6YJ1LS'
			// Setup helpers
			chapterHelper = new ChapterHelper(asin)
			helper = new StitchHelper(asin)
			// Run helpers
			const chapterData = await chapterHelper.process()
			const newBook = await helper.process()
			// Set variables
			chapters = chapterData
			response = newBook
		})

		it('returned the correct data', () => {
			expect(response).toEqual(combinedB08C6YJ1LS)
		})

		it('returned the correct chapters', () => {
			expect(chapters).toEqual(setupParsedChapter(chapterResponseB08C6YJ1LS, asin))
		})
	})

	describe('When fetching an ASIN that has no chapters or HTML', () => {
		beforeAll(async () => {
			asin = 'B0036I54I6'
			// Setup helpers
			chapterHelper = new ChapterHelper(asin)
			helper = new StitchHelper(asin)
			// Run helpers
			const chapterData = await chapterHelper.process()
			const newBook = await helper.process()
			// Set variables
			chapters = chapterData
			response = newBook
		})

		it('returned the correct data', () => {
			expect(response).toEqual(minimalB0036I54I6)
		})

		it('returned the correct chapters', () => {
			expect(chapters).toBeUndefined()
		})
	})
})
