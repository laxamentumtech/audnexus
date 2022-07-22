import originalFetch from 'isomorphic-fetch'

import { BookDocument } from '#config/models/Book'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetch = require('fetch-retry')(originalFetch)

class SeedHelper {
	book: BookDocument

	constructor(book: BookDocument) {
		this.book = book
	}

	/**
	 * Calls authors endpoint in the background with ASIN supplied
	 * @param {string} asin
	 */
	async seedAll() {
		// Seed authors in the background
		try {
			this.book.authors?.map((author) => {
				if (author && author.asin) {
					return fetch('http://localhost:3000/authors/' + author.asin)
				}
				return undefined
			})
		} catch (err) {
			console.error(err)
		}
	}
}

export default SeedHelper
