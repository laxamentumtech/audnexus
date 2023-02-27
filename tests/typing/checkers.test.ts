import {
	isAuthorDocument,
	isBookDocument,
	isChapterDocument
} from '#config/typing/checkers'
import { authorWithId, parsedAuthor } from '#tests/datasets/helpers/authors'
import { bookWithId, parsedBook } from '#tests/datasets/helpers/books'
import { chaptersWithId, parsedChapters } from '#tests/datasets/helpers/chapters'

describe('Author type checks for', () => {
	test('isAuthorDocument returns true if author is an AuthorDocument', () => {
		expect(isAuthorDocument(authorWithId())).toBe(true)
	})
	test('isAuthorDocument returns false if author is not an AuthorDocument', () => {
		expect(isAuthorDocument(parsedAuthor)).toBe(false)
	})
	test('isAuthorDocument returns false if input is falsy', () => {
		expect(isAuthorDocument(null)).toBe(false)
		expect(isAuthorDocument(undefined)).toBe(false)
		expect(isAuthorDocument('')).toBe(false)
		expect(isAuthorDocument({})).toBe(false)
	})
})

describe('Book type checks for', () => {
	test('isBookDocument returns true if book is a BookDocument', () => {
		expect(isBookDocument(bookWithId())).toBe(true)
	})
	test('isBookDocument eturns false if book is not a BookDocument', () => {
		expect(isBookDocument(parsedBook)).toBe(false)
	})
	test('isBookDocument returns false if input is falsy', () => {
		expect(isBookDocument(null)).toBe(false)
		expect(isBookDocument(undefined)).toBe(false)
		expect(isBookDocument('')).toBe(false)
		expect(isBookDocument({})).toBe(false)
	})
})

describe('Chapter type checks for', () => {
	test('isChapterDocument returns true if chapter is a ChapterDocument', () => {
		expect(isChapterDocument(chaptersWithId())).toBe(true)
	})
	test('isChapterDocument returns false if chapter is not a ChapterDocument', () => {
		expect(isChapterDocument(parsedChapters)).toBe(false)
	})
	test('isChapterDocument returns false if input is falsy', () => {
		expect(isChapterDocument(null)).toBe(false)
		expect(isChapterDocument(undefined)).toBe(false)
		expect(isChapterDocument('')).toBe(false)
		expect(isChapterDocument({})).toBe(false)
	})
})
