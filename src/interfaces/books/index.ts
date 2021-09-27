import { AuthorInterface, NarratorInterface } from '../people/index'

export interface ApiSingleChapterInterface {
    lengthMs: number,
    startOffsetMs: number,
    startOffsetSec: number,
    title: string
}

export interface ApiChapterInterface {
    asin: string,
    brandIntroDurationMs: number,
    brandOutroDurationMs: number,
    chapters: ApiSingleChapterInterface[],
    isAccurate: boolean,
    runtimeLengthMs: number,
    runtimeLengthSec: number
}

export interface GenreInterface {
    asin: string,
    name: string,
    type: string
}

export interface SeriesInterface {
    asin?: string,
    name: string,
    position?: string
}

interface CoreBook {
    asin: string;
    authors: AuthorInterface[];
    description: string;
    formatType: string;
    image: string;
    language: string;
    narrators?: NarratorInterface[];
    publisherName: string;
    rating: number;
    releaseDate: Date;
    runtimeLengthMin: number;
    subtitle?: string;
    summary: string;
    title: string;
}

// Final format of data stored
export interface BookInterface extends CoreBook {
    chapterInfo: ApiChapterInterface;
    genres?: GenreInterface[];
    seriesPrimary?: SeriesInterface;
    seriesSecondary?: SeriesInterface;
}

// What we expect to keep from Audible's API
export interface ApiBookInterface extends CoreBook {
    publicationName?: string;
}

// What we expect to keep from Audible's HTML pages
export interface HtmlBookInterface {
    genres?: GenreInterface[];
    series?: SeriesInterface[];
    seriesPrimary?: SeriesInterface;
    seriesSecondary?: SeriesInterface;
}
