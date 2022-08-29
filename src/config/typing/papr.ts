import { AuthorDocument } from '#config/models/Author'
import { BookDocument } from '#config/models/Book'
import { ChapterDocument } from '#config/models/Chapter'
import { ApiChapter, Book } from '#config/typing/books'
import { AuthorProfile } from '#config/typing/people'

interface GenericReturn {
	data: AuthorProfile | AuthorDocument | Book | BookDocument | ApiChapter | ChapterDocument | null
	modified: boolean
}

export interface PaprAuthorReturn extends GenericReturn {
	data: AuthorProfile | null
}

export interface PaprAuthorDocumentReturn extends GenericReturn {
	data: AuthorDocument | null
}

export interface PaprBookReturn extends GenericReturn {
	data: Book | null
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
