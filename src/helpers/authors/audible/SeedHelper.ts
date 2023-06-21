import { ApiBook } from '#config/types'
import fetch from '#helpers/utils/fetchPlus'
import getErrorMessage from '#helpers/utils/getErrorMessage'

class SeedHelper {
	book: ApiBook

	constructor(book: ApiBook) {
		this.book = book
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
					} catch (error) {
						return false
					}
				})
			)
		} catch (error) {
			const message = getErrorMessage(error)
			console.error(message)
		}
	}
}

export default SeedHelper
