import { AuthorOnBook, NarratorOnBook } from '#config/typing/people'

export interface ApiSingleChapter {
	lengthMs: number
	startOffsetMs: number
	startOffsetSec: number
	title: string
}

export interface ApiChapter {
	asin: string
	brandIntroDurationMs: number
	brandOutroDurationMs: number
	chapters: ApiSingleChapter[]
	isAccurate: boolean
	runtimeLengthMs: number
	runtimeLengthSec: number
}

export interface ApiGenre {
	asin: string
	name: string
	type: string
}

export interface Series {
	asin?: string
	name: string
	position?: string
}

interface CoreBook {
	asin: string
	authors: AuthorOnBook[]
	description: string
	formatType: string
	genres?: ApiGenre[]
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
export interface Book extends CoreBook {
	chapterInfo?: ApiChapter
	seriesPrimary?: Series
	seriesSecondary?: Series
}

// What we expect to keep from Audible's API
export interface ApiBook extends CoreBook {
	seriesPrimary?: Series
	seriesSecondary?: Series
}

// What we expect to keep from Audible's HTML pages
export interface HtmlBook {
	genres: ApiGenre[]
}
