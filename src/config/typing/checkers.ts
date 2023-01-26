import { AuthorDocument } from '#config/models/Author'
import { BookDocument } from '#config/models/Book'
import { ChapterDocument } from '#config/models/Chapter'
import { ApiChapter, Book } from '#config/typing/books'
import { AuthorProfile } from '#config/typing/people'

// Use name for validity checking since it is unique to authors
export function isAuthorProfile(author: unknown): author is AuthorProfile {
	if (!author) return false
	return typeof author === 'object' && !('_id' in author) && 'name' in author
}

export function isAuthorDocument(author: unknown): author is AuthorDocument {
	if (!author) return false
	return typeof author === 'object' && '_id' in author && 'name' in author
}

// Use title for validity checking since it is unique to books
export function isBook(book: unknown): book is Book {
	if (!book) return false
	return typeof book === 'object' && !('_id' in book) && 'title' in book
}

export function isBookDocument(book: unknown): book is BookDocument {
	if (!book) return false
	return typeof book === 'object' && '_id' in book && 'title' in book
}

// Use runtimeLengthMs for validity checking since it is unique to chapters
export function isChapter(chapter: unknown): chapter is ApiChapter {
	if (!chapter) return false
	return typeof chapter === 'object' && !('_id' in chapter) && 'runtimeLengthMs' in chapter
}

export function isChapterDocument(chapter: unknown): chapter is ChapterDocument {
	if (!chapter) return false
	return typeof chapter === 'object' && '_id' in chapter && 'runtimeLengthMs' in chapter
}
