import { GenreInterface } from '../audible'

interface Person {
    name: string
}

export interface AuthorOnBook extends Person {
    asin?: string
}

export interface AuthorProfile extends Person {
    asin: string
    description?: string
    genres?: GenreInterface[]
    image?: string
}

export interface NarratorOnBook extends Person {}
