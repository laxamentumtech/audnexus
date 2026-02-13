import type { FastifyBaseLogger } from 'fastify'
import { htmlToText } from 'html-to-text'

import {
	ApiAuthorOnBook,
	ApiBook,
	ApiBookSchema,
	ApiGenre,
	ApiGenreSchema,
	ApiNarratorOnBook,
	ApiSeries,
	ApiSeriesSchema,
	AudibleCategory,
	AudibleCategorySchema,
	AudibleProduct,
	AudibleProductSchema,
	AudibleSeries,
	AudibleSeriesSchema,
	baseShape,
	FallbackAudibleProduct,
	fallbackShape
} from '#config/types'
import { ContentTypeMismatchError, NotFoundError } from '#helpers/errors/ApiErrors'
import cleanupDescription from '#helpers/utils/cleanupDescription'
import fetch from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'
import {
	ErrorMessageContentTypeMismatch,
	ErrorMessageHTTPFetch,
	ErrorMessageNoData,
	ErrorMessageParse,
	ErrorMessageRegion,
	ErrorMessageReleaseDate,
	ErrorMessageRequiredKey
} from '#static/messages'
import { regions } from '#static/regions'

class ApiHelper {
	asin: string
	categories: AudibleCategory[][] | undefined
	audibleResponse: AudibleProduct['product'] | FallbackAudibleProduct | undefined
	region: string
	requestUrl: string
	logger?: FastifyBaseLogger
	constructor(asin: string, region: string, logger?: FastifyBaseLogger) {
		this.asin = asin
		this.region = region
		this.logger = logger
		const helper = new SharedHelper()
		const baseDomain = 'https://api.audible'
		const regionTLD = regions[region].tld
		const baseUrl = '1.0/catalog/products'
		// Last item is intentionally image_sizes
		const paramArr = [
			'category_ladders',
			'contributors',
			'media',
			'product_attrs',
			'product_desc',
			'product_details',
			'product_extended_attrs',
			'rating',
			'series',
			'image_sizes=500,1024'
		]
		const paramStr = helper.getParamString(paramArr)
		const params = `response_groups=${paramStr}`
		this.requestUrl = helper.buildUrl(asin, baseDomain, regionTLD, baseUrl, params)
	}

	/**
	 * Convert category object to ApiGenre object
	 * @param {AudibleCategory} category category to convert
	 */
	categoryToApiGenre(category: AudibleCategory, type: string): ApiGenre {
		const convertedObject = {
			asin: category.id,
			name: category.name,
			type: type
		}

		// Parse the resulting object to ensure it matches the ApiGenre type
		const parsed = ApiGenreSchema.safeParse(convertedObject)
		// Return the parsed object if it matches the type
		if (parsed.success) return parsed.data
		// Throw an error if it doesn't match the type
		throw new Error(ErrorMessageParse(this.asin, 'ApiHelper'))
	}

	isCategory(category: unknown): category is AudibleCategory {
		return AudibleCategorySchema.safeParse(category).success
	}

	isGenre(genre: unknown): genre is ApiGenre {
		return ApiGenreSchema.safeParse(genre).success
	}

	getCopyrightYear() {
		if (!this.audibleResponse) throw new Error(ErrorMessageNoData(this.asin, 'ApiHelper'))
		const regex = /(?:©|\(c\)|copyright\b)\s*(\d{4})/iu
		const copyright = this.audibleResponse.copyright
		if (!copyright) return undefined
		const match = regex.exec(copyright)

		// find the lowest year in the string
		if (match) {
			try {
				const years = match[1].split('-').map(Number)
				return Math.min(...years)
			} catch {
				return undefined
			}
		}
	}

	/**
	 * Find the parent categories (genres) of the given category array
	 * @param {AudibleCategory[]} categories array of categories to check
	 * @returns {ApiGenre[]} array of parent categories converted to ApiGenre
	 */
	getGenres(): ApiGenre[] {
		if (!this.categories) throw new Error(ErrorMessageNoData(this.asin, 'ApiHelper'))

		// Genres ARE parent categories
		// First item from each ladder is parent category (genre)
		const rawGenres = this.categories.map((ladder) => ladder.shift()).filter(this.isCategory)
		const genres = [...new Map(rawGenres.map((item) => [item.name, item])).values()]

		// Transform categories to ApiGenres
		// Filter out undefined values
		return genres
			.map((category) => {
				return this.categoryToApiGenre(category, 'genre')
			})
			.filter(this.isGenre)
	}

	/**
	 * Find the sub categories (tags) of the given category array
	 * @param {AudibleCategory[]} categories array of categories to check
	 * @returns {ApiGenre[]} array of sub categories converted to ApiGenre
	 */
	getTags(): ApiGenre[] {
		if (!this.categories) throw new Error(ErrorMessageNoData(this.asin, 'ApiHelper'))

		// Tags are NOT parent categories
		const rawTags = this.categories.flat()
		const tags = [...new Map(rawTags.map((item) => [item.name, item])).values()]

		// Transform categories to ApiGenres
		// Filter out undefined values
		return tags
			.map((category) => {
				return this.categoryToApiGenre(category, 'tag')
			})
			.filter(this.isGenre)
	}

	/**
	 * Transform the raw category data into a usable format
	 */
	getCategories() {
		if (!this.audibleResponse) throw new Error(ErrorMessageNoData(this.asin, 'ApiHelper'))

		// Set category ladders to class variable
		this.categories = this.audibleResponse.category_ladders.map(({ ladder }) => ladder)
	}

	/**
	 * Get the highest resolution image url available,
	 * or return undefined if no image is available
	 */
	getHighResImage() {
		if (!this.audibleResponse) throw new Error(ErrorMessageNoData(this.asin, 'ApiHelper'))
		if (!this.audibleResponse.product_images) return undefined
		return this.audibleResponse.product_images[1024]
			? this.audibleResponse.product_images[1024].replace('_SL1024_.', '')
			: this.audibleResponse.product_images[500]?.replace('_SL500_.', '') || undefined
	}

	/**
	 * Determine the date to use for the release date.
	 * Either:
	 *
	 * 1. The release date of the product
	 * 2. The issue date of the product
	 *
	 * Error on a date in the future.
	 */
	getReleaseDate() {
		if (!this.audibleResponse) throw new Error(ErrorMessageNoData(this.asin, 'ApiHelper'))
		const releaseDate = this.audibleResponse.release_date
			? new Date(this.audibleResponse.release_date)
			: new Date(this.audibleResponse.issue_date)

		// Check that release date isn't in the future
		if (releaseDate > new Date()) throw new Error(ErrorMessageReleaseDate(this.asin))
		return releaseDate
	}

	/**
	 * Transform series data into a usable format
	 */
	getSeries(series: AudibleSeries): ApiSeries | undefined {
		// Check if series is valid
		if (!AudibleSeriesSchema.safeParse(series).success) return undefined
		// Rearrange series data into ApiSeries format
		const seriesJson = {
			...(series.asin && {
				asin: series.asin
			}),
			name: series.title,
			...(series.sequence && {
				position: series.sequence
			})
		}
		// Return series if valid
		return ApiSeriesSchema.parse(seriesJson)
	}

	/**
	 * Determine if the series array contains a series, which matches publication_name.
	 * This typically means the series in publication_name is the default series.
	 */
	getSeriesPrimary(allSeries: AudibleSeries[]): ApiSeries | undefined {
		let seriesPrimary = {}
		allSeries.forEach((series: AudibleSeries) => {
			if (!this.audibleResponse) throw new Error(ErrorMessageNoData(this.asin, 'ApiHelper'))
			// Only return series for MultiPartBook/SinglePartBook, makes linter happy
			if (
				this.audibleResponse.content_delivery_type === 'PodcastParent' ||
				this.audibleResponse.content_delivery_type === 'Unknown'
			) {
				return undefined
			}
			const seriesJson = this.getSeries(series)
			// Check and set primary series
			if (
				this.audibleResponse.publication_name &&
				seriesJson?.name === this.audibleResponse.publication_name
			) {
				seriesPrimary = seriesJson
			}
		})
		// Check if series is valid
		const seriesReturn = ApiSeriesSchema.safeParse(seriesPrimary)
		// Return series if valid, otherwise return undefined
		return seriesReturn.success ? seriesReturn.data : undefined
	}

	/**
	 * Determine which series is NOT the primary series.
	 * This is done by comparing the series name to the publication_name.
	 */
	getSeriesSecondary(allSeries: AudibleSeries[]): ApiSeries | undefined {
		let seriesSecondary = {}
		allSeries.forEach((series: AudibleSeries) => {
			if (!this.audibleResponse) throw new Error(ErrorMessageNoData(this.asin, 'ApiHelper'))
			// Only return series for MultiPartBook/SinglePartBook, makes linter happy
			if (
				this.audibleResponse.content_delivery_type === 'PodcastParent' ||
				this.audibleResponse.content_delivery_type === 'Unknown'
			) {
				return undefined
			}
			const seriesJson = this.getSeries(series)
			// Check and set secondary series
			if (
				allSeries.length > 1 &&
				seriesJson &&
				seriesJson.name !== this.audibleResponse.publication_name
			) {
				seriesSecondary = seriesJson
			}
		})
		// Check if series is valid
		const seriesReturn = ApiSeriesSchema.safeParse(seriesSecondary)
		// Return series if valid, otherwise return undefined
		return seriesReturn.success ? seriesReturn.data : undefined
	}

	/**
	 * Compile the final data object.
	 * This is run after all other data has been parsed.
	 */
	getFinalData(): ApiBook {
		if (!this.audibleResponse) throw new Error(ErrorMessageNoData(this.asin, 'ApiHelper'))
		// Get flattened categories
		this.getCategories()
		// Find secondary series if available
		let series1: ApiSeries | undefined
		let series2: ApiSeries | undefined
		// Only return series for MultiPartBook/SinglePartBook, makes linter happy
		if (
			this.audibleResponse.content_delivery_type !== 'PodcastParent' &&
			this.audibleResponse.content_delivery_type !== 'Unknown' &&
			this.audibleResponse.series
		) {
			series1 = this.getSeriesPrimary(this.audibleResponse.series)
			series2 = this.getSeriesSecondary(this.audibleResponse.series)
		}
		// Parse final data
		return ApiBookSchema.parse({
			asin: this.audibleResponse.asin,
			authors: this.audibleResponse.authors.map((person: ApiAuthorOnBook) => {
				const authorJson: ApiAuthorOnBook = {
					asin: person.asin,
					name: person.name
				}
				return authorJson
			}),
			copyright: this.getCopyrightYear(),
			description: cleanupDescription(
				htmlToText(this.audibleResponse['merchandising_summary'], {
					wordwrap: false
				})
			).trim(),
			formatType: this.audibleResponse.format_type,
			...(this.categories && {
				genres: [...this.getGenres(), ...this.getTags()]
			}),
			image: this.getHighResImage(),
			isAdult: this.audibleResponse.is_adult_product,
			isbn: this.audibleResponse.isbn ?? '',
			language: this.audibleResponse.language,
			literatureType: this.audibleResponse.thesaurus_subject_keywords?.some((keyword) =>
				keyword.includes('fiction')
			)
				? 'fiction'
				: 'nonfiction',
			narrators:
				this.audibleResponse.narrators?.map((person: ApiNarratorOnBook) => {
					const narratorJson: ApiNarratorOnBook = {
						...(person.asin && {
							asin: person.asin
						}),
						name: person.name
					}
					return narratorJson
				}) || [],
			publisherName: this.audibleResponse.publisher_name,
			...(this.audibleResponse.rating && {
				rating: this.audibleResponse.rating.overall_distribution.display_average_rating.toString()
			}),
			region: this.region,
			releaseDate: this.getReleaseDate(),
			runtimeLengthMin: this.audibleResponse.runtime_length_min ?? 0,
			...(series1 && {
				seriesPrimary: series1,
				...(series2 && {
					seriesSecondary: series2
				})
			}),
			subtitle: this.audibleResponse.subtitle,
			summary: this.audibleResponse.publisher_summary,
			title: this.audibleResponse.title
		})
	}

	/**
	 * Fetches Audible API JSON
	 * @param {scraperUrl} requestUrl the full url to fetch.
	 * @returns {Promise<AudibleProduct>} response from Audible API
	 */
	async fetchBook(): Promise<AudibleProduct> {
		return fetch(this.requestUrl)
			.then(async (response) => {
				const json: AudibleProduct = response.data
				return json
			})
			.catch((error) => {
				throw new Error(ErrorMessageHTTPFetch(this.asin, error.status, 'Audible API'))
			})
	}

	/**
	 * Parses fetched Audible API data
	 * @param {AudibleProduct} jsonResponse fetched json response from api.audible.com
	 * @returns {Promise<ApiBook>} relevant data to keep
	 */
	async parseResponse(jsonResponse: AudibleProduct | undefined): Promise<ApiBook> {
		// Base undefined check
		if (!jsonResponse) {
			throw new Error(ErrorMessageParse(this.asin, 'Audible API'))
		}

		const product = jsonResponse.product
		const contentType = product?.content_delivery_type

		// Check for content type mismatch (e.g., podcast instead of book)
		if (contentType === 'PodcastParent') {
			throw new ContentTypeMismatchError(
				ErrorMessageContentTypeMismatch(this.asin, 'podcast', 'book'),
				{ asin: this.asin, requestedType: 'book', actualType: 'PodcastParent' }
			)
		}

		// Check if content_delivery_type exists and is a known book type
		const knownTypes = ['MultiPartBook', 'SinglePartBook']
		if (!contentType || !knownTypes.includes(contentType)) {
			// Try parsing with baseShape directly (fallback for missing/unknown type)
			const baseResult = baseShape.safeParse(product)
			if (baseResult.success) {
				// Log unknown type for future analysis
				this.logger?.warn(
					`[AUDIBLE API] Unknown content_delivery_type: ${contentType} for ASIN ${this.asin}`
				)
				// Set the discriminant for the fallback type
				this.audibleResponse = fallbackShape.parse({
					...baseResult.data,
					content_delivery_type: 'Unknown'
				})
				return this.getFinalData()
			}
			// baseShape also failed - likely truly unavailable in region
			throw new NotFoundError(ErrorMessageRegion(this.asin, this.region), {
				asin: this.asin,
				code: 'REGION_UNAVAILABLE'
			})
		}

		// Parse response with zod for known content_delivery_type values
		const response = AudibleProductSchema.safeParse(jsonResponse)
		// Handle error if response is not valid
		if (!response.success) {
			// Get the key 'path' from the first issue
			const issuesPath = response.error.issues[0].path
			// Get the last key from the path, which is the key that is missing
			const key = issuesPath[issuesPath.length - 1]

			// Throw error with the missing key
			throw new Error(ErrorMessageRequiredKey(this.asin, String(key), 'exist'))
		}

		// Set response to class variable on success
		this.audibleResponse = response.data.product

		// Return final data
		return this.getFinalData()
	}
}

export default ApiHelper
