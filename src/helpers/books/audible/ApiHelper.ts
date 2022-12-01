import { htmlToText } from 'html-to-text'

import { AudibleProduct, AudibleSeries, Category } from '#config/typing/audible'
import { ApiBook, ApiGenre, Series } from '#config/typing/books'
import { AuthorOnBook, NarratorOnBook } from '#config/typing/people'
import fetch from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'
import {
	ErrorMessageHTTPFetch,
	ErrorMessageNoData,
	ErrorMessageParse,
	ErrorMessageReleaseDate,
	ErrorMessageRequiredKey
} from '#static/messages'
import { regions } from '#static/regions'

class ApiHelper {
	asin: string
	categories: Category[][] | undefined
	inputJson: AudibleProduct['product'] | undefined
	region: string
	reqUrl: string
	constructor(asin: string, region: string) {
		this.asin = asin
		this.region = region
		const helper = new SharedHelper()
		const baseDomain = 'https://api.audible'
		const regionTLD = regions[region].tld
		const baseUrl = '1.0/catalog/products'
		const paramArr = [
			'category_ladders',
			'contributors',
			'product_desc',
			'product_extended_attrs',
			'product_attrs',
			'media',
			'rating',
			'series',
			'image_sizes=500,1024'
		]
		const paramStr = helper.getParamString(paramArr)
		const params = `?response_groups=${paramStr}`
		this.reqUrl = helper.buildUrl(asin, baseDomain, regionTLD, baseUrl, params)
	}

	/**
	 * Checks if all required keys are present
	 * These are the keys that are required to build the final data object
	 * @returns validity as boolean, and error message as string
	 */
	hasRequiredKeys(): { isValid: boolean; message: string } {
		let message = ''
		const isValidKey = (key: string): boolean => {
			if (!this.inputJson) throw new Error(ErrorMessageNoData(this.asin, 'ApiHelper'))

			// Make sure key exists in inputJson
			const keyExists = Object.hasOwnProperty.call(this.inputJson, key)

			// Get value of key
			const value = this.inputJson[key as keyof typeof this.inputJson]

			// Check if this looks like a podcast
			const isPodcast = key === 'runtime_length_min' && this.inputJson.content_type === 'Podcast'

			// Allow 0 as a valid value
			const isNumberAndZero = typeof value === 'number' && value === 0

			// Break on non valid value
			let isValidKey = true
			switch (isValidKey) {
				case isPodcast:
					break
				case !keyExists:
					isValidKey = false
					message = ErrorMessageRequiredKey(this.asin, key, 'exist')
					break
				case !value && !isNumberAndZero:
					isValidKey = false
					message = ErrorMessageRequiredKey(this.asin, key, 'have a valid value')
					break
			}

			return isValidKey
		}

		// Create new const for presence check
		const requiredKeys = [
			'asin',
			'authors',
			'format_type',
			'language',
			'merchandising_summary',
			'publisher_name',
			'publisher_summary',
			'release_date',
			'runtime_length_min',
			'title'
		]
		const isValid = requiredKeys.every((key) => isValidKey(key))

		return {
			isValid,
			message
		}
	}

	/**
	 * Convert category object to ApiGenre object
	 * @param {Category} category category to convert
	 */
	categoryToApiGenre(category: Category, type: string): ApiGenre {
		return {
			asin: category.id,
			name: category.name,
			type: type
		}
	}

	isGenre(genre: unknown): genre is ApiGenre {
		if (!genre) return false
		const genreKeys = ['asin', 'name', 'type']
		const genreKeysExist = Object.keys(genre).every((key) => genreKeys.includes(key))
		const genreKeysValid = Object.values(genre).every((value) => value !== undefined)
		return genreKeysExist && genreKeysValid
	}

	/**
	 * Find the parent categories (genres) of the given category array
	 * @param {Category[]} categories array of categories to check
	 * @returns {ApiGenre[]} array of parent categories converted to ApiGenre
	 */
	getGenres(): ApiGenre[] {
		if (!this.categories) throw new Error(ErrorMessageNoData(this.asin, 'ApiHelper'))

		// Genres ARE parent categories
		// First item from each ladder is parent category (genre)
		const rawGenres = this.categories.map((ladder) => ladder.shift())
		const genres = [...new Map(rawGenres.map((item) => [item?.name, item])).values()]

		// Transform categories to ApiGenres
		// Filter out undefined values
		return genres
			.map((category) => {
				if (!category) return
				return this.categoryToApiGenre(category, 'genre')
			})
			.filter(this.isGenre)
	}

	/**
	 * Find the sub categories (tags) of the given category array
	 * @param {Category[]} categories array of categories to check
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
				if (!category) return
				return this.categoryToApiGenre(category, 'tag')
			})
			.filter(this.isGenre)
	}

	/**
	 * Transform the raw category data into a usable format
	 */
	getCategories() {
		if (!this.inputJson) throw new Error(ErrorMessageNoData(this.asin, 'ApiHelper'))

		// Set category ladders to class variable
		this.categories = this.inputJson.category_ladders.map(({ ladder }) => ladder)
	}

	/**
	 * Get the highest resolution image url available,
	 * or return undefined if no image is available
	 */
	getHighResImage() {
		if (!this.inputJson) throw new Error(ErrorMessageNoData(this.asin, 'ApiHelper'))
		if (!this.inputJson.product_images) return undefined
		return this.inputJson.product_images[1024]
			? this.inputJson.product_images[1024].replace('_SL1024_.', '')
			: this.inputJson.product_images[500]?.replace('_SL500_.', '') || undefined
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
		if (!this.inputJson) throw new Error(ErrorMessageNoData(this.asin, 'ApiHelper'))
		const releaseDate = this.inputJson.release_date
			? new Date(this.inputJson.release_date)
			: new Date(this.inputJson.issue_date)

		// Check that release date isn't in the future
		if (releaseDate > new Date()) throw new Error(ErrorMessageReleaseDate(this.asin))
		return releaseDate
	}

	/**
	 * Transform series data into a usable format
	 */
	getSeries(series: AudibleSeries) {
		if (!series.title) return undefined
		const seriesJson: Series = {
			...(series.asin && {
				asin: series.asin
			}),
			name: series.title,
			...(series.sequence && {
				position: series.sequence
			})
		}
		return seriesJson
	}

	/**
	 * Determine if the series array contains a series, which matches publication_name.
	 * This typically means the series in publication_name is the default series.
	 */
	getSeriesPrimary(allSeries: AudibleSeries[] | undefined) {
		let seriesPrimary = {} as Series
		allSeries?.forEach((series: AudibleSeries) => {
			if (!this.inputJson) throw new Error(ErrorMessageNoData(this.asin, 'ApiHelper'))
			const seriesJson = this.getSeries(series)
			// Check and set primary series
			if (this.inputJson.publication_name && seriesJson?.name === this.inputJson.publication_name) {
				seriesPrimary = seriesJson
			}
		})
		if (!seriesPrimary.name) return undefined
		return seriesPrimary
	}

	/**
	 * Determine which series is NOT the primary series.
	 * This is done by comparing the series name to the publication_name.
	 */
	getSeriesSecondary(allSeries: AudibleSeries[] | undefined) {
		let seriesSecondary = {} as Series
		allSeries?.forEach((series: AudibleSeries) => {
			if (!this.inputJson) throw new Error(ErrorMessageNoData(this.asin, 'ApiHelper'))
			const seriesJson = this.getSeries(series)
			// Check and set secondary series
			if (
				allSeries.length > 1 &&
				seriesJson &&
				seriesJson.name !== this.inputJson.publication_name
			) {
				seriesSecondary = seriesJson
			}
		})
		if (!seriesSecondary.name) return undefined
		return seriesSecondary
	}

	/**
	 * Compile the final data object.
	 * This is run after all other data has been parsed.
	 */
	getFinalData(): ApiBook {
		if (!this.inputJson) throw new Error(ErrorMessageNoData(this.asin, 'ApiHelper'))
		// Get flattened categories
		this.getCategories()
		// Find secondary series if available
		const series1 = this.getSeriesPrimary(this.inputJson.series)
		const series2 = this.getSeriesSecondary(this.inputJson.series)
		return {
			asin: this.inputJson.asin,
			authors: this.inputJson.authors.map((person: AuthorOnBook) => {
				const authorJson: AuthorOnBook = {
					asin: person.asin,
					name: person.name
				}
				return authorJson
			}),
			description: htmlToText(this.inputJson['merchandising_summary'], {
				wordwrap: false
			}).trim(),
			formatType: this.inputJson.format_type,
			...(this.categories && {
				genres: [...this.getGenres(), ...this.getTags()]
			}),
			image: this.getHighResImage(),
			language: this.inputJson.language,
			narrators:
				this.inputJson.narrators?.map((person: NarratorOnBook) => {
					const narratorJson: NarratorOnBook = {
						name: person.name
					}
					return narratorJson
				}) || [],
			publisherName: this.inputJson.publisher_name,
			...(this.inputJson.rating && {
				rating: this.inputJson.rating.overall_distribution.display_average_rating.toString()
			}),
			region: this.region,
			releaseDate: this.getReleaseDate(),
			runtimeLengthMin: this.inputJson.runtime_length_min ?? 0,
			...(this.inputJson.series && {
				seriesPrimary: series1,
				...(series2 && {
					seriesSecondary: series2
				})
			}),
			subtitle: this.inputJson.subtitle,
			summary: this.inputJson.publisher_summary,
			title: this.inputJson.title
		}
	}

	/**
	 * Fetches Audible API JSON
	 * @param {scraperUrl} reqUrl the full url to fetch.
	 * @returns {Promise<AudibleProduct>} response from Audible API
	 */
	async fetchBook(): Promise<AudibleProduct> {
		return fetch(this.reqUrl)
			.then(async (response) => {
				const json: AudibleProduct = await response.json()
				return json
			})
			.catch((error) => {
				throw new Error(ErrorMessageHTTPFetch(this.asin, error.status, 'Audible API'))
			})
	}

	/**
	 * Parses fetched Audible API data
	 * @param {AudibleProduct} jsonRes fetched json response from api.audible.com
	 * @returns {Promise<ApiBook>} relevant data to keep
	 */
	async parseResponse(jsonRes: AudibleProduct | undefined): Promise<ApiBook> {
		// Base undefined check
		if (!jsonRes) {
			throw new Error(ErrorMessageParse(this.asin, 'Audible API'))
		}
		this.inputJson = jsonRes.product

		// Check all required keys present
		const requiredKeys = this.hasRequiredKeys()
		if (!requiredKeys.isValid) {
			throw new Error(requiredKeys.message)
		}

		return this.getFinalData()
	}
}

export default ApiHelper
