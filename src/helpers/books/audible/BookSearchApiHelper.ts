import type { FastifyBaseLogger } from 'fastify'

import { ApiBook, AudibleProduct } from '#config/types'
import ApiHelper, { REQUESTED_IMAGE_SIZES } from '#helpers/books/audible/ApiHelper'
import {
	fetchStatus,
	isInvalidTagsGroupError,
	withoutResponseGroup
} from '#helpers/books/audible/responseGroups'
import fetch from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'
import { ErrorMessageHTTPFetch } from '#static/messages'
import { regions } from '#static/regions'

class BookSearchApiHelper {
	query: string
	region: string
	requestUrl: string
	logger?: FastifyBaseLogger

	constructor(query: string, region: string, logger?: FastifyBaseLogger) {
		this.query = query
		this.region = region
		this.logger = logger
		const helper = new SharedHelper()
		const baseDomain = 'https://api.audible'
		const regionTLD = regions[region].tld
		const baseUrl = '1.0/catalog/products'
		// Same response groups as single ASIN lookup so getFinalData() can be reused
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
			'tags'
		]
		// Goodreads ratings are only requested for the US catalog
		if (region === 'us') paramArr.push('goodreads_ratings')
		paramArr.push(`image_sizes=${REQUESTED_IMAGE_SIZES.join(',')}`)
		const paramStr = helper.getParamString(paramArr)
		const encoded = encodeURIComponent(query)
		const NUM_RESULTS = 10
		this.requestUrl = `${baseDomain}.${regionTLD}/${baseUrl}?keywords=${encoded}&num_results=${NUM_RESULTS}&response_groups=${paramStr}`
	}

	async fetchBooks(): Promise<{ products: AudibleProduct['product'][] }> {
		const fetchOnce = (url: string) =>
			fetch(url).then((response) => response.data as { products: AudibleProduct['product'][] })
		try {
			return await fetchOnce(this.requestUrl)
		} catch (error) {
			// One-shot fail-open: when Audible rejects the `tags` response
			// group, retry exactly once without it.
			if (isInvalidTagsGroupError(error)) {
				try {
					return await fetchOnce(withoutResponseGroup(this.requestUrl, 'tags'))
				} catch (fallbackError) {
					throw new Error(
						ErrorMessageHTTPFetch(
							'Audible book search API',
							fetchStatus(fallbackError),
							'Audible API'
						),
						{ cause: fallbackError }
					)
				}
			}
			throw new Error(
				ErrorMessageHTTPFetch('Audible book search API', fetchStatus(error), 'Audible API'),
				{ cause: error }
			)
		}
	}

	async parseResults(): Promise<ApiBook[]> {
		const response = await this.fetchBooks()
		if (!response?.products?.length) return []

		const results = await Promise.allSettled(
			response.products.map(async (product) => {
				const helper = new ApiHelper(product.asin, this.region, this.logger)
				helper.audibleResponse = product
				return helper.getFinalData()
			})
		)

		for (const [i, r] of results.entries()) {
			if (r.status === 'rejected') {
				this.logger?.warn(
					{ asin: response.products[i].asin, err: r.reason },
					'Failed to parse search result'
				)
			}
		}

		return results
			.filter((r): r is PromiseFulfilledResult<ApiBook> => r.status === 'fulfilled')
			.map((r) => r.value)
	}
}

export default BookSearchApiHelper
