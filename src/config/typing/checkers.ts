import { AuthorDocument } from '#config/models/Author'
import { BookDocument } from '#config/models/Book'
import { ChapterDocument } from '#config/models/Chapter'
import { ApiChapter, Book } from '#config/typing/books'
import { AuthorProfile } from '#config/typing/people'

export function isAuthorProfile(author: unknown): author is AuthorProfile {
	if (!author) return false
	return typeof author === 'object' && 'name' in author
}

export function isAuthorDocument(author: unknown): author is AuthorDocument {
	if (!author) return false
	return typeof author === 'object' && '_id' in author && 'name' in author
}

export function isBook(book: unknown): book is Book {
	if (!book) return false
	return typeof book === 'object' && 'title' in book
}

export function isBookDocument(book: unknown): book is BookDocument {
	if (!book) return false
	return typeof book === 'object' && '_id' in book && 'title' in book
}

export function isChapter(chapter: unknown): chapter is ApiChapter {
	if (!chapter) return false
	return typeof chapter === 'object' && 'runtimeLengthMs' in chapter
}

export function isChapterDocument(chapter: unknown): chapter is ChapterDocument {
	if (!chapter) return false
	return typeof chapter === 'object' && '_id' in chapter && 'runtimeLengthMs' in chapter
}
