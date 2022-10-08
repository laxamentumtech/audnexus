import { Book } from '#config/typing/books'
import fetch from '#helpers/utils/fetchPlus'
import getErrorMessage from '#helpers/utils/getErrorMessage'

class SeedHelper {
	book: Book

	constructor(book: Book) {
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
					if (author.asin) {
						const request = await fetch('http://localhost:3000/authors/' + author.asin)
						return request.ok
					}
					return false
				})
			)
		} catch (error) {
			const message = getErrorMessage(error)
			console.error(message)
		}
	}
}

export default SeedHelper
