import { htmlToText } from 'html-to-text'

import { AudibleProduct, AudibleSeries, Category } from '#config/typing/audible'
import { ApiBook, ApiGenre, Series } from '#config/typing/books'
import { AuthorOnBook, NarratorOnBook } from '#config/typing/people'
import fetch from '#helpers/fetchPlus'
import SharedHelper from '#helpers/shared'
import { parentCategories } from '#static/constants'

class ApiHelper {
	asin: string
	reqUrl: string
	inputJson: AudibleProduct['product'] | undefined
	constructor(asin: string) {
		this.asin = asin
		const helper = new SharedHelper()
		const baseDomain = 'https://api.audible.com'
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
		this.reqUrl = helper.buildUrl(asin, baseDomain, baseUrl, params)
	}

	hasRequiredKeys() {
		const isValidKey = (key: string): boolean => {
			if (!this.inputJson) throw new Error(`No input data`)
			// Make sure key exists in inputJson
			if (!Object.hasOwnProperty.call(this.inputJson, key)) return false
			// Get value of key
			const value = this.inputJson[key as keyof typeof this.inputJson]
			// Allow 0 as a valid value
			if (typeof value === 'number' && value === 0) return true
			// Make sure key is not falsy
			if (!value) return false

			return true
		}

		// Create new const for presence check within forloop
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

		return requiredKeys.every((key) => isValidKey(key))
	}

	isParentCategory(category: Category): boolean {
		return parentCategories.some((parentCategory) => {
			return parentCategory.id === category.id && parentCategory.name === category.name
		})
	}

	categoryToApiGenre(category: Category, type: string): ApiGenre {
		return {
			asin: category.id,
			name: category.name,
			type: type
		}
	}

	getGenres(categories: Category[]): ApiGenre[] {
		// Genres ARE parent categories
		const filtered = categories.filter(this.isParentCategory)
		// Transform categories to ApiGenres
		return filtered.map((category) => {
			return this.categoryToApiGenre(category, 'genre')
		})
	}

	getTags(categories: Category[]): ApiGenre[] {
		// Tags are NOT parent categories
		const filtered = categories.filter((e) => !this.isParentCategory(e))
		// Transform categories to ApiGenres
		return filtered.map((category) => {
			return this.categoryToApiGenre(category, 'tag')
		})
	}

	getCategories(): Category[] | undefined {
		if (!this.inputJson) throw new Error(`No input data`)
		// Flatten category ladders to a single array of categories
		const categories = this.inputJson.category_ladders.map((category) => category.ladder).flat()
		// Remove duplicates from categories array
		return [...new Map(categories.map((item) => [item.name, item])).values()]
	}

	getHighResImage() {
		if (!this.inputJson) throw new Error(`No input data`)
		if (!this.inputJson.product_images) return undefined
		return this.inputJson.product_images[1024]
			? this.inputJson.product_images[1024].replace('_SL1024_.', '')
			: this.inputJson.product_images[500]?.replace('_SL500_.', '') || undefined
	}

	getReleaseDate() {
		if (!this.inputJson) throw new Error(`No input data`)
		const releaseDate = this.inputJson.release_date
			? new Date(this.inputJson.release_date)
			: new Date(this.inputJson.issue_date)

		// Check that release date isn't in the future
		if (releaseDate > new Date()) throw new Error('Release date is in the future')
		return releaseDate
	}

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

	getSeriesPrimary(allSeries: AudibleSeries[] | undefined) {
		let seriesPrimary = {} as Series
		allSeries?.forEach((series: AudibleSeries) => {
			if (!this.inputJson) throw new Error(`No input data`)
			const seriesJson = this.getSeries(series)
			// Check and set primary series
			if (this.inputJson.publication_name && seriesJson?.name === this.inputJson.publication_name) {
				seriesPrimary = seriesJson
			}
		})
		if (!seriesPrimary.name) return undefined
		return seriesPrimary
	}

	getSeriesSecondary(allSeries: AudibleSeries[] | undefined) {
		let seriesSecondary = {} as Series
		allSeries?.forEach((series: AudibleSeries) => {
			if (!this.inputJson) throw new Error(`No input data`)
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

	getFinalData(): ApiBook {
		if (!this.inputJson) throw new Error(`No input data`)
		// Get flattened categories
		const categories = this.getCategories()
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
			...(categories && {
				genres: [...this.getGenres(categories), ...this.getTags(categories)]
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
			releaseDate: this.getReleaseDate(),
			runtimeLengthMin: this.inputJson.runtime_length_min,
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
				const message = `An error has occured while fetching from Audible API. Response: ${error.status}, ASIN: ${this.asin}`
				throw new Error(message)
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
			throw new Error('No API response to parse')
		}
		this.inputJson = jsonRes.product

		// Check all required keys present
		if (!this.hasRequiredKeys()) {
			throw new Error(`The API does not have all the keys required for parsing on ${this.asin}`)
		}

		return this.getFinalData()
	}
}

export default ApiHelper
