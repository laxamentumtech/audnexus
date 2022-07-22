import { htmlToText } from 'html-to-text'
import originalFetch from 'isomorphic-fetch'

import { AudibleProduct, AudibleSeries } from '#config/typing/audible'
import { ApiBook, Series } from '#config/typing/books'
import { AuthorOnBook, NarratorOnBook } from '#config/typing/people'
import SharedHelper from '#helpers/shared'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetch = require('fetch-retry')(originalFetch)

class ApiHelper {
	asin: string
	reqUrl: string
	inputJson: AudibleProduct['product'] | undefined
	constructor(asin: string) {
		this.asin = asin
		const helper = new SharedHelper()
		const baseDomain = 'https://api.audible.com'
		const baseUrl = '1.0/catalog/products'
		const params =
			'?response_groups=contributors,product_desc,product_extended_attrs,product_attrs,media,rating,series&image_sizes=500,1024'
		this.reqUrl = helper.buildUrl(asin, baseDomain, baseUrl, params)
	}

	checkRequiredKeys() {
		const requiredKeys = [
			'asin',
			'authors',
			'format_type',
			'language',
			'merchandising_summary',
			'product_images',
			'publisher_name',
			'publisher_summary',
			'release_date',
			'runtime_length_min',
			'title'
		]

		requiredKeys.forEach((key) => {
			if (!Object.prototype.hasOwnProperty.call(this.inputJson, key)) {
				throw new Error(`Required key: ${key}, does not exist on: ${this.inputJson?.asin}`)
			}
		})
	}

	getHighResImage() {
		if (!this.inputJson) throw new Error(`No input data`)
		return this.inputJson.product_images?.[1024]
			? this.inputJson.product_images?.[1024]?.replace('_SL1024_.', '')
			: this.inputJson.product_images?.[500]?.replace('_SL500_.', '')
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

	getSeriesPrimary(allSeries: AudibleSeries[]) {
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

	getSeriesSecondary(allSeries: AudibleSeries[]) {
		let seriesSecondary = {} as Series
		allSeries?.forEach((series: AudibleSeries) => {
			if (!this.inputJson) throw new Error(`No input data`)
			const seriesJson = this.getSeries(series)
			// Check and set secondary series
			if (
				allSeries.length > 1 &&
				seriesJson &&
				seriesJson?.name !== this.inputJson.publication_name
			) {
				seriesSecondary = seriesJson
			}
		})
		if (!seriesSecondary.name) return undefined
		return seriesSecondary
	}

	getFinalData(): ApiBook {
		if (!this.inputJson) throw new Error(`No input data`)
		// Find secondary series if available
		const series1 = this.getSeriesPrimary(this.inputJson.series)
		const series2 = this.getSeriesSecondary(this.inputJson.series)
		return {
			asin: this.inputJson.asin,
			authors:
				this.inputJson.authors?.map((person: AuthorOnBook) => {
					const authorJson: AuthorOnBook = {
						asin: person.asin,
						name: person.name
					}
					return authorJson
				}) || [],
			description: htmlToText(this.inputJson['merchandising_summary'], {
				wordwrap: false
			}).trim(),
			formatType: this.inputJson.format_type,
			image: this.getHighResImage(),
			language: this.inputJson.language,
			...(this.inputJson.narrators && {
				narrators: this.inputJson.narrators?.map((person: NarratorOnBook) => {
					const narratorJson: NarratorOnBook = {
						name: person.name
					}
					return narratorJson
				})
			}),
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
			...(this.inputJson.subtitle && {
				subtitle: this.inputJson.subtitle
			}),
			summary: this.inputJson.publisher_summary,
			title: this.inputJson.title
		}
	}

	/**
	 * Fetches Audible API JSON
	 * @param {scraperUrl} reqUrl the full url to fetch.
	 * @returns {Promise<AudibleProduct>} response from Audible API
	 */
	async fetchBook(): Promise<AudibleProduct | undefined> {
		const response = await fetch(this.reqUrl)
		if (!response.ok) {
			const message = `An error has occured while fetching from Audible API. Response: ${response.status}, ASIN: ${this.asin}`
			throw new Error(message)
		} else {
			const json: AudibleProduct = await response.json()
			return json
		}
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
		this.checkRequiredKeys()

		return this.getFinalData()
	}
}

export default ApiHelper
