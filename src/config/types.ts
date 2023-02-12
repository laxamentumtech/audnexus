import { z } from 'zod'

import { asin10Regex, asin11Regex } from '#helpers/utils/shared'

// Reusable types
const asin = z.string().regex(asin10Regex)
const genreAsin = z.string().regex(asin11Regex)
const nameOrTitle = z.string().min(1)

// Chapters
const ApiSingleChapterSchema = z.object({
	lengthMs: z.number().or(z.literal(0)),
	startOffsetMs: z.number().or(z.literal(0)),
	startOffsetSec: z.number().or(z.literal(0)),
	title: nameOrTitle
})
export type ApiSingleChapter = z.infer<typeof ApiSingleChapterSchema>

export const ApiChapterSchema = z.object({
	asin,
	brandIntroDurationMs: z.number().or(z.literal(0)),
	brandOutroDurationMs: z.number().or(z.literal(0)),
	chapters: z.array(ApiSingleChapterSchema),
	isAccurate: z.boolean(),
	region: z.string(),
	runtimeLengthMs: z.number().or(z.literal(0)),
	runtimeLengthSec: z.number().or(z.literal(0))
})
export type ApiChapter = z.infer<typeof ApiChapterSchema>

// Genres
export const ApiGenreSchema = z.object({
	asin: genreAsin,
	name: nameOrTitle,
	type: z.string()
})
export type ApiGenre = z.infer<typeof ApiGenreSchema>

// Series
export const ApiSeriesSchema = z.object({
	asin: asin.optional(),
	name: nameOrTitle,
	position: z.string().optional()
})
export type ApiSeries = z.infer<typeof ApiSeriesSchema>

// People
const PersonSchema = z.object({
	name: nameOrTitle
})

export const ApiAuthorOnBookSchema = PersonSchema.extend({
	asin: z.string().optional()
})
export type ApiAuthorOnBook = z.infer<typeof ApiAuthorOnBookSchema>

export const ApiAuthorProfileSchema = PersonSchema.extend({
	asin,
	description: z.string().optional(),
	genres: z.array(ApiGenreSchema).optional(),
	image: z.string().optional(),
	region: z.string()
})
export type ApiAuthorProfile = z.infer<typeof ApiAuthorProfileSchema>

export const ApiNarratorOnBookSchema = PersonSchema
export type ApiNarratorOnBook = z.infer<typeof ApiNarratorOnBookSchema>

// Books
const ApiCoreBookSchema = z.object({
	asin,
	authors: z.array(ApiAuthorOnBookSchema),
	description: z.string(),
	formatType: z.string(),
	genres: z.array(ApiGenreSchema).optional(),
	image: z.string().url().optional(),
	language: z.string(),
	narrators: z.array(ApiNarratorOnBookSchema).optional(),
	publisherName: z.string(),
	rating: z.string(),
	region: z.string(),
	releaseDate: z.date(),
	runtimeLengthMin: z.number().or(z.literal(0)),
	subtitle: z.string().optional(),
	summary: z.string(),
	title: nameOrTitle
})

// What we expect to keep from Audible's API
export const ApiBookSchema = ApiCoreBookSchema.extend({
	seriesPrimary: ApiSeriesSchema.optional(),
	seriesSecondary: ApiSeriesSchema.optional()
})
export type ApiBook = z.infer<typeof ApiBookSchema>

// Final format of data stored
export const BookSchema = ApiBookSchema.extend({
	chapterInfo: ApiChapterSchema.optional()
})
export type Book = z.infer<typeof BookSchema>

// What we expect to keep from Audible's HTML pages
export const HtmlBookSchema = z.object({
	genres: z.array(ApiGenreSchema).min(1)
})
export type HtmlBook = z.infer<typeof HtmlBookSchema>

// Audible
export const AudibleCategorySchema = z.object({
	id: z.string(),
	name: nameOrTitle
})
export type AudibleCategory = z.infer<typeof AudibleCategorySchema>

const AudibleCategoriesSchema = z.object({
	ladder: z.array(AudibleCategorySchema),
	root: z.string()
})

const AudibleCodecSchema = z.object({
	enhanced_codec: z.string(),
	format: z.string(),
	is_kindle_enhanced: z.boolean(),
	name: nameOrTitle
})

const AudibleRatingItemSchema = z.object({
	average_rating: z.number().or(z.literal(0)),
	display_average_rating: z.string(),
	display_stars: z.number().or(z.literal(0)),
	num_five_star_ratings: z.number().or(z.literal(0)),
	num_four_star_ratings: z.number().or(z.literal(0)),
	num_one_star_ratings: z.number().or(z.literal(0)),
	num_ratings: z.number().or(z.literal(0)),
	num_three_star_ratings: z.number().or(z.literal(0)),
	num_two_star_ratings: z.number().or(z.literal(0))
})

const AudibleRatingSchema = z.object({
	num_reviews: z.number().or(z.literal(0)),
	overall_distribution: AudibleRatingItemSchema,
	performance_distribution: AudibleRatingItemSchema,
	story_distribution: AudibleRatingItemSchema
})

export const AudibleSeriesSchema = z.object({
	asin: asin.optional(),
	title: nameOrTitle,
	sequence: z.string().optional(),
	url: z.string().optional()
})
export type AudibleSeries = z.infer<typeof AudibleSeriesSchema>

// This is the base shape of the data we get from Audible's API for all content
const baseShape = z.object({
	asin,
	authors: z.array(ApiAuthorOnBookSchema),
	available_codecs: z.array(AudibleCodecSchema).optional(),
	category_ladders: z.array(AudibleCategoriesSchema),
	content_type: z.string(),
	editorial_reviews: z.array(z.string()).optional(),
	format_type: z.string(),
	has_children: z.boolean(),
	is_adult_product: z.boolean(),
	is_listenable: z.boolean(),
	is_purchasability_suppressed: z.boolean(),
	issue_date: z.string(),
	language: z.string(),
	merchandising_summary: z.string(),
	narrators: z.array(ApiNarratorOnBookSchema).optional(),
	product_images: z.record(z.string(), z.string().url()).optional(),
	publisher_name: z.string(),
	publisher_summary: z.string(),
	rating: AudibleRatingSchema,
	release_date: z.string(),
	runtime_length_min: z.number().or(z.literal(0)).optional(),
	sku: z.string().optional(),
	sku_lite: z.string().optional(),
	social_media_images: z.record(z.string()),
	subtitle: z.string().optional(),
	thesaurus_subject_keywords: z.array(z.string()),
	title: nameOrTitle
})

// This is the shape of the data we get from Audible's API for podcast content
const podcastShape = z.object({
	continuity: z.string(),
	content_delivery_type: z.literal('PodcastParent'),
	episode_count: z.number().or(z.literal(0)),
	new_episode_added_date: z.string().datetime(),
	program_participation: z.string(),
	publication_datetime: z.string().datetime()
})

// This is the shape of the data we get from Audible's API for series content
const seriesShape = z.object({
	content_delivery_type: z.literal('MultiPartBook'),
	publication_name: z.string().optional(),
	series: z.array(AudibleSeriesSchema).optional()
})

// Make a discriminated union of the base shape and the two types of content we get from Audible's API based on the content_delivery_type field
const resultShape = z
	.discriminatedUnion('content_delivery_type', [
		podcastShape,
		seriesShape,
		z.object({
			content_delivery_type: z.literal('SinglePartBook')
		})
	])
	.and(baseShape)

export const AudibleProductSchema = z.object({
	product: resultShape,
	response_groups: z.array(z.string())
})
export type AudibleProduct = z.infer<typeof AudibleProductSchema>

export const AudibleSingleChapterSchema = z.object({
	length_ms: z.number().or(z.literal(0)),
	start_offset_ms: z.number().or(z.literal(0)),
	start_offset_sec: z.number().or(z.literal(0)),
	title: nameOrTitle
})
export type AudibleSingleChapter = z.infer<typeof AudibleSingleChapterSchema>

export const AudibleChapterSchema = z.object({
	content_metadata: z.object({
		chapter_info: z.object({
			brandIntroDurationMs: z.number().or(z.literal(0)),
			brandOutroDurationMs: z.number().or(z.literal(0)),
			chapters: z.array(AudibleSingleChapterSchema),
			is_accurate: z.boolean(),
			runtime_length_ms: z.number().or(z.literal(0)),
			runtime_length_sec: z.number().or(z.literal(0))
		})
	}),
	response_groups: z.array(z.string())
})
export type AudibleChapter = z.infer<typeof AudibleChapterSchema>

// Requests
export const ApiQueryStringSchema = z.object({
	name: z.string().optional(),
	region: z.string().length(2).default('us'),
	seedAuthors: z.enum(['0', '1']).optional(),
	update: z.enum(['0', '1']).optional()
})

export type ApiQueryString = z.infer<typeof ApiQueryStringSchema>
