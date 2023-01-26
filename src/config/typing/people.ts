import { ApiGenre } from '#config/typing/books'

interface Person {
	name: string
}

export interface AuthorOnBook extends Person {
	asin?: string
}

export interface AuthorProfile extends Person {
	asin: string
	description?: string
	genres?: ApiGenre[]
	image?: string
	region: string
}

export type NarratorOnBook = Person
