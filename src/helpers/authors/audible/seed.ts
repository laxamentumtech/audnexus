import { BookDocument } from '#config/models/Book'
import fetch from 'isomorphic-fetch'

class AuthorSeedHelper {
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

export default AuthorSeedHelper
