import { AuthorDocument } from '#config/models/Author'
import { BookDocument } from '#config/models/Book'
import { ChapterDocument } from '#config/models/Chapter'

export function isAuthorDocument(author: unknown): author is AuthorDocument {
	if (!author) return false
	return typeof author === 'object' && '_id' in author && 'name' in author
}

export function isBookDocument(book: unknown): book is BookDocument {
	if (!book) return false
	return typeof book === 'object' && '_id' in book && 'title' in book
}

export function isChapterDocument(chapter: unknown): chapter is ChapterDocument {
	if (!chapter) return false
	return typeof chapter === 'object' && '_id' in chapter && 'runtimeLengthMs' in chapter
}
