import { Genre } from '#config/typing/audible'

interface Person {
	name: string
}

export interface AuthorOnBook extends Person {
	asin?: string
}

export interface AuthorProfile extends Person {
	asin: string
	description?: string
	genres?: Genre[]
	image?: string
}

export type NarratorOnBook = Person
