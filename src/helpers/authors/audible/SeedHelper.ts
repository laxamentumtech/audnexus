import type { FastifyBaseLogger } from 'fastify'

import { ApiBook } from '#config/types'
import fetch from '#helpers/utils/fetchPlus'
import getErrorMessage from '#helpers/utils/getErrorMessage'

class SeedHelper {
	book: ApiBook
	logger?: FastifyBaseLogger

	constructor(book: ApiBook, logger?: FastifyBaseLogger) {
		this.book = book
		this.logger = logger
	}

	/**
	 * Calls authors endpoint in the background with ASIN supplied
	 * @param {string} asin
	 */
	async seedAll() {
		// Seed authors in the background
		try {
			return await Promise.all(
				this.book.authors.map(async (author) => {
					try {
						if (author.asin) {
							const response = await fetch('http://localhost:3000/authors/' + author.asin)
							return response.status === 200
						}
						return false
					} catch {
						return false
					}
				})
			)
		} catch (error) {
			const message = getErrorMessage(error)
			this.logger?.error(message)
			return []
		}
	}
}

export default SeedHelper
