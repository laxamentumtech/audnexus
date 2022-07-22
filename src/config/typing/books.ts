import { GenreInterface } from '#config/typing/audible'
import { AuthorOnBook, NarratorOnBook } from '#config/typing/people'

export interface ApiSingleChapterInterface {
    lengthMs: number
    startOffsetMs: number
    startOffsetSec: number
    title: string
}

export interface ApiChapterInterface {
    asin: string
    brandIntroDurationMs: number
    brandOutroDurationMs: number
    chapters: ApiSingleChapterInterface[]
    isAccurate: boolean
    runtimeLengthMs: number
    runtimeLengthSec: number
}

export interface SeriesInterface {
    asin?: string
    name: string
    position?: string
}

interface CoreBook {
    asin: string
    authors: AuthorOnBook[]
    description: string
    formatType: string
    image: string
    language: string
    narrators?: NarratorOnBook[]
    publisherName: string
    rating: string
    releaseDate: Date
    runtimeLengthMin: number
    subtitle?: string
    summary: string
    title: string
}

// Final format of data stored
export interface BookInterface extends CoreBook {
    chapterInfo?: ApiChapterInterface
    genres?: GenreInterface[]
    seriesPrimary?: SeriesInterface
    seriesSecondary?: SeriesInterface
}

// What we expect to keep from Audible's API
export interface ApiBookInterface extends CoreBook {
    seriesPrimary?: SeriesInterface
    seriesSecondary?: SeriesInterface
}

// What we expect to keep from Audible's HTML pages
export interface HtmlBookInterface {
    genres?: GenreInterface[]
}
