import { AuthorInterface, NarratorInterface } from '../people/index'

export interface GenreInterface {
    asin: string,
    name: string,
    type: string
}

export interface SeriesInterface {
    asin: string,
    name: string,
    position: string
}

interface CoreBook {
    asin: string;
    title: string;
    subtitle?: string;
    description: string;
    summary: string;
    authors: AuthorInterface[];
    narrators?: NarratorInterface[];
    releaseDate: Date;
    publisherName: string;
    language: string;
    runtimeLengthMin: number;
    formatType: string;
    image: string;
}

// Final format of data stored
export interface BookInterface extends CoreBook {
    genres?: GenreInterface[];
    primarySeries?: SeriesInterface;
    secondarySeries?: SeriesInterface;
}

// What we expect to keep from Audible's API
export interface ApiBookInterface extends CoreBook {
    publicationName?: string;
}

// What we expect to keep from Audible's HTML pages
export interface HtmlBookInterface {
    genres?: GenreInterface[];
    series?: SeriesInterface[];
    primarySeries?: SeriesInterface;
    secondarySeries?: SeriesInterface;
}
