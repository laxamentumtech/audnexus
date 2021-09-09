interface Person {
    name: string;
}

export interface AuthorInterface extends Person {
    asin?: string
}

export interface NarratorInterface extends Person {}
