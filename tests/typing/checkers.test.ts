import {
	isAuthorDocument,
	isAuthorProfile,
	isBook,
	isBookDocument,
	isChapter,
	isChapterDocument
} from '#config/typing/checkers'
import { authorWithId, parsedAuthor } from '#tests/datasets/helpers/authors'
import { bookWithId, parsedBook } from '#tests/datasets/helpers/books'
import { chaptersWithId, parsedChapters } from '#tests/datasets/helpers/chapters'

describe('Author type checks for', () => {
	test('isAuthorProfile returns true if author is an AuthorProfile', () => {
		expect(isAuthorProfile(parsedAuthor)).toBe(true)
	})
	test('isAuthorProfile returns false if author is not an AuthorProfile', () => {
		expect(isAuthorProfile(authorWithId())).toBe(false)
	})
	test('isAuthorProfile returns false if input is falsy', () => {
		expect(isAuthorProfile(null)).toBe(false)
		expect(isAuthorProfile(undefined)).toBe(false)
		expect(isAuthorProfile('')).toBe(false)
		expect(isAuthorProfile({})).toBe(false)
	})
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
	test('isBook returns true if book is a Book', () => {
		expect(isBook(parsedBook)).toBe(true)
	})
	test('isBook returns false if book is not a Book', () => {
		expect(isBook(bookWithId())).toBe(false)
	})
	test('isBook returns false if input is falsy', () => {
		expect(isBook(null)).toBe(false)
		expect(isBook(undefined)).toBe(false)
		expect(isBook('')).toBe(false)
		expect(isBook({})).toBe(false)
	})
	test('isBookDocument returns true if book is a BookDocument', () => {
		expect(isBookDocument(bookWithId())).toBe(true)
	})
	test('risBookDocument eturns false if book is not a BookDocument', () => {
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
	test('isChapter returns true if chapter is a ApiChapter', () => {
		expect(isChapter(parsedChapters)).toBe(true)
	})
	test('isChapter returns false if chapter is not a ApiChapter', () => {
		expect(isChapter(chaptersWithId())).toBe(false)
	})
	test('isChapter returns false if input is falsy', () => {
		expect(isChapter(null)).toBe(false)
		expect(isChapter(undefined)).toBe(false)
		expect(isChapter('')).toBe(false)
		expect(isChapter({})).toBe(false)
	})
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
