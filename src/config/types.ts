import { z } from 'zod'

import { regions } from '#static/regions'

// List of regions
const regionTLDs = Object.keys(regions) as [string, ...string[]]

// Regexes
export const baseAsin10Regex = /(B[\dA-Z]{9}|\d{9}(X|\d))/
// base regex with beginning and end anchors
export const asin10Regex = new RegExp(`^${baseAsin10Regex.source}$`)
export const asin11Regex = /\d{11}/gm

// Reusable types
export const AsinSchema = z.string().regex(asin10Regex)
// Using different regex for 11 digit ASINs because zod validation needs quantifier
export const GenreAsinSchema = z.string().regex(new RegExp(/^\d{10,12}$/))
export const NameSchema = z.string().min(2)
export const TitleSchema = z.string().min(1)
export const RegionSchema = z.enum(regionTLDs).default('us')

// Chapters
const ApiSingleChapterSchema = z.object({
	lengthMs: z.number().or(z.literal(0)),
	startOffsetMs: z.number().or(z.literal(0)),
	startOffsetSec: z.number().or(z.literal(0)),
	title: TitleSchema
})
export type ApiSingleChapter = z.infer<typeof ApiSingleChapterSchema>

export const ApiChapterSchema = z.object({
	asin: AsinSchema,
	brandIntroDurationMs: z.number().or(z.literal(0)),
	brandOutroDurationMs: z.number().or(z.literal(0)),
	chapters: z.array(ApiSingleChapterSchema),
	isAccurate: z.boolean(),
	region: RegionSchema,
	runtimeLengthMs: z.number().or(z.literal(0)),
	runtimeLengthSec: z.number().or(z.literal(0))
})
export type ApiChapter = z.infer<typeof ApiChapterSchema>

// Genres
export const ApiGenreSchema = z.object({
	asin: GenreAsinSchema,
	name: NameSchema,
	type: z.string()
})
export type ApiGenre = z.infer<typeof ApiGenreSchema>

// Series
export const ApiSeriesSchema = z.object({
	asin: AsinSchema.optional(),
	name: NameSchema,
	position: z.string().optional()
})
export type ApiSeries = z.infer<typeof ApiSeriesSchema>

// People
export const ApiAuthorOnBookSchema = z.object({
	asin: AsinSchema.optional(),
	name: NameSchema
})
export type ApiAuthorOnBook = z.infer<typeof ApiAuthorOnBookSchema>

export const ApiAuthorProfileSchema = z.object({
	asin: AsinSchema,
	description: z.string().optional(),
	genres: z.array(ApiGenreSchema).optional(),
	image: z.string().optional(),
	name: NameSchema,
	region: RegionSchema,
	similar: z.array(ApiAuthorOnBookSchema).optional()
})
export type ApiAuthorProfile = z.infer<typeof ApiAuthorProfileSchema>

export const ApiNarratorOnBookSchema = z.object({
	asin: AsinSchema.optional(),
	name: NameSchema
})
export type ApiNarratorOnBook = z.infer<typeof ApiNarratorOnBookSchema>

// Books
// What we expect to keep from Audible's API
export const ApiBookSchema = z.object({
	asin: AsinSchema,
	authors: z.array(ApiAuthorOnBookSchema),
	copyright: z.number().int().optional(),
	description: z.string(),
	formatType: z.string(),
	genres: z.array(ApiGenreSchema).optional(),
	image: z.string().url().optional(),
	isAdult: z.boolean().default(false),
	isbn: z.string().optional(),
	language: z.string(),
	literatureType: z
		.string()
		.refine((val) => ['fiction', 'nonfiction'].includes(val))
		.optional(),
	narrators: z.array(ApiNarratorOnBookSchema).optional(),
	publisherName: z.string(),
	rating: z.string(),
	region: RegionSchema,
	releaseDate: z.date(),
	runtimeLengthMin: z.number().default(0),
	seriesPrimary: ApiSeriesSchema.optional(),
	seriesSecondary: ApiSeriesSchema.optional(),
	subtitle: z.string().optional(),
	summary: z.string(),
	title: TitleSchema
})
export type ApiBook = z.infer<typeof ApiBookSchema>

// What we expect to keep from Audible's HTML pages
export const HtmlBookSchema = z.object({
	genres: z.array(ApiGenreSchema).min(1)
})
export type HtmlBook = z.infer<typeof HtmlBookSchema>

// Audible
export const AudibleCategorySchema = z.object({
	id: GenreAsinSchema,
	name: NameSchema
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
	name: NameSchema
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
	asin: AsinSchema.optional(),
	title: TitleSchema,
	sequence: z.string().optional(),
	url: z.string().optional()
})
export type AudibleSeries = z.infer<typeof AudibleSeriesSchema>

// This is the base shape of the data we get from Audible's API for all content
export const baseShape = z.object({
	asin: AsinSchema,
	authors: z.array(ApiAuthorOnBookSchema),
	available_codecs: z.array(AudibleCodecSchema).optional(),
	category_ladders: z.array(AudibleCategoriesSchema),
	content_type: z.string(),
	copyright: z.string().optional(),
	date_first_available: z.string().optional(),
	editorial_reviews: z.array(z.string()).optional(),
	extended_product_description: z.string().optional(),
	format_type: z.string(),
	has_children: z.boolean(),
	is_adult_product: z.boolean(),
	is_listenable: z.boolean(),
	is_pdf_url_available: z.boolean().optional(),
	is_purchasability_suppressed: z.boolean(),
	isbn: z.string().optional(),
	issue_date: z.string(),
	language: z.string(),
	merchandising_description: z.string().optional(),
	merchandising_summary: z.string(),
	narrators: z.array(ApiNarratorOnBookSchema).optional(),
	product_images: z.record(z.string(), z.string().url()).optional(),
	platinum_keywords: z.array(z.string()).optional(),
	product_site_launch_date: z.string().datetime().optional(),
	publisher_name: z.string(),
	publisher_summary: z.string().optional(),
	rating: AudibleRatingSchema.optional(),
	// Audible passes this as a string, but it's a boolean in the string
	read_along_support: z.coerce.boolean().optional(),
	release_date: z.string(),
	runtime_length_min: z.number().or(z.literal(0)).optional(),
	sku: z.string().optional(),
	sku_lite: z.string().optional(),
	social_media_images: z.record(z.string(), z.string()).optional(),
	subtitle: z.string().optional(),
	thesaurus_subject_keywords: z.array(z.string()).optional(),
	title: TitleSchema
})

// This is the shape of the data we get from Audible's API for podcast content
const podcastShape = z.object({
	continuity: z.string(),
	content_delivery_type: z.literal('PodcastParent'),
	episode_count: z.number().or(z.literal(0)),
	new_episode_added_date: z.string().datetime(),
	program_participation: z.string().optional(),
	publication_datetime: z.string().datetime()
})

// This is the shape of the data we get from Audible's API for series content
const seriesShape = z.object({
	content_delivery_type: z.enum(['MultiPartBook', 'SinglePartBook']),
	publication_name: z.string().optional(),
	series: z.array(AudibleSeriesSchema).optional()
})

// This is the shape for fallback when content_delivery_type is missing or unknown
export const fallbackShape = baseShape.extend({
	content_delivery_type: z.literal('Unknown')
})
export type FallbackAudibleProduct = z.infer<typeof fallbackShape>

// Make a discriminated union of the base shape and the two types of content we get from Audible's API based on the content_delivery_type field
const resultShape = z
	.discriminatedUnion('content_delivery_type', [podcastShape, seriesShape])
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
	title: TitleSchema
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
	name: NameSchema.optional(),
	region: RegionSchema,
	seedAuthors: z.enum(['0', '1']).optional(),
	update: z.enum(['0', '1']).optional()
})

export type ApiQueryString = z.infer<typeof ApiQueryStringSchema>
