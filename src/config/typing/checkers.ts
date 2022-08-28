import { BookDocument } from '#config/models/Book'
import { Book } from '#config/typing/books'

export function isBook(book: unknown): book is Book {
	if (!book) return false
	return typeof book === 'object' && 'title' in book
}

export function isBookDocument(book: unknown): book is BookDocument {
	if (!book) return false
	return typeof book === 'object' && '_id' in book && 'title' in book
}
