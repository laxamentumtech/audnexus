import { DeleteResult } from 'mongodb'

import { AuthorDocument } from '#config/models/Author'
import { BookDocument } from '#config/models/Book'
import { ChapterDocument } from '#config/models/Chapter'
import { ApiAuthorProfile, ApiBook, ApiChapter } from '#config/types'

interface GenericReturn {
	data:
		| ApiAuthorProfile
		| AuthorDocument
		| ApiBook
		| BookDocument
		| ApiChapter
		| ChapterDocument
		| null
	modified: boolean
}

export interface PaprAuthorReturn extends GenericReturn {
	data: ApiAuthorProfile | null
}

export interface PaprAuthorDocumentReturn extends GenericReturn {
	data: AuthorDocument | null
}

export interface PaprAuthorSearch {
	data: { asin: string; name: string }[]
	modified: boolean
}

export interface PaprBookReturn extends GenericReturn {
	data: ApiBook | null
}

export interface PaprBookDocumentReturn extends GenericReturn {
	data: BookDocument | null
}

export interface PaprChapterReturn extends GenericReturn {
	data: ApiChapter | null
}

export interface PaprChapterDocumentReturn extends GenericReturn {
	data: ChapterDocument | null
}

export interface PaprDeleteReturn {
	data: DeleteResult
	modified: boolean
}

export type PaprDocument = AuthorDocument | BookDocument | ChapterDocument
