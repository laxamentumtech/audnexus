import { GenreInterface } from '../audible'

interface Person {
    name: string;
}

export interface AuthorInterface extends Person {
    asin?: string;
    description?: string;
    genres?: GenreInterface[];
    image?: string;
}

export interface NarratorInterface extends Person {}
