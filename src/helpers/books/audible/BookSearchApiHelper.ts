import type { FastifyBaseLogger } from 'fastify'

import ApiHelper from './ApiHelper'

import { ApiBook, AudibleProduct } from '#config/types'
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
			'image_sizes=500,1024'
		]
		const paramStr = helper.getParamString(paramArr)
		const encoded = encodeURIComponent(query)
		this.requestUrl = `${baseDomain}.${regionTLD}/${baseUrl}?keywords=${encoded}&num_results=10&response_groups=${paramStr}`
	}

	async fetchBooks(): Promise<{ products: AudibleProduct['product'][] }> {
		return fetch(this.requestUrl)
			.then((response) => response.data as { products: AudibleProduct['product'][] })
			.catch((error) => {
				throw new Error(ErrorMessageHTTPFetch('search', error.status, 'Audible API'))
			})
	}

	async parseResults(): Promise<ApiBook[]> {
		const response = await this.fetchBooks()
		if (!response?.products?.length) return []

		const results = await Promise.allSettled(
			response.products.map((product) => {
				const helper = new ApiHelper(product.asin, this.region, this.logger)
				helper.audibleResponse = product
				return helper.getFinalData()
			})
		)

		return results
			.filter((r): r is PromiseFulfilledResult<ApiBook> => r.status === 'fulfilled')
			.map((r) => r.value)
	}
}

export default BookSearchApiHelper
