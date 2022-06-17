import Author from '#config/models/Author'
import SharedHelper from '#helpers/shared'
import { BookInterface } from '#interfaces/books'
import { AuthorInterface } from '#interfaces/people'
import Book from '#models/Book'

export class PaprAudibleAuthorHelper {
    asin: string
    dbProjection: {}
    authorData!: AuthorInterface
    options: { seed?: string; update?: string }

    constructor(asin: string, options: { update?: string }) {
        this.asin = asin
        this.options = options
        this.dbProjection = {
            projection: {
                _id: 0,
                asin: 1,
                description: 1,
                genres: 1,
                image: 1,
                name: 1
            }
        }
    }

    async create() {
        try {
            const authorToReturn = await Author.insertOne(this.authorData)
            return {
                data: authorToReturn,
                modified: true
            }
        } catch (err) {
            throw new Error(err as string)
        }
    }

    async delete() {
        try {
            const deletedAuthor = await Author.deleteOne({ asin: this.asin })
            return {
                data: deletedAuthor,
                modified: true
            }
        } catch (err) {
            throw new Error(err as string)
        }
    }

    async find() {}

    async findOne() {
        const findOneAuthor = await Author.findOne(
            {
                asin: this.asin
            },
            this.dbProjection
        )
        return {
            data: findOneAuthor,
            modified: false
        }
    }

    async createOrUpdate() {
        const commonHelpers = new SharedHelper()
        const findInDb = await this.findOne()

        // Update
        if (this.options.update === '0' && findInDb.data) {
            // If the objects are the exact same return right away
            commonHelpers.checkDataEquality(findInDb.data, this.authorData)
            // Check state of existing author
            // Only update if either genres exist and can be checked
            // -or if genres exist on new item but not old
            if (findInDb.data.genres || (!findInDb.data.genres && this.authorData.genres)) {
                // Only update if it's not nuked data
                if (this.authorData.genres && this.authorData.genres.length) {
                    console.log(`Updating author asin ${this.asin}`)
                    // Update
                    try {
                        const updatedAuthor = await this.update()
                        return updatedAuthor
                    } catch (err) {
                        throw new Error(err as string)
                    }
                }
            } else if (this.authorData.genres && this.authorData.genres.length) {
                // If no genres exist on author, but do on incoming, update
                console.log(`Updating author asin ${this.asin}`)
                // Update
                try {
                    const updatedAuthor = await this.update()
                    return updatedAuthor
                } catch (err) {
                    throw new Error(err as string)
                }
            }
            // No update performed, return original
            return findInDb
        }

        // Create
        try {
            const createdAuthor = await this.create()
            return createdAuthor
        } catch (err) {
            console.error(err)
            throw new Error(`An error occurred while creating author ${this.asin} in the DB`)
        }
    }

    async update() {
        try {
            await Author.updateOne({ asin: this.asin }, { $set: this.authorData })
            // After updating, return with specific projection
            const authorToReturn = await this.findOne()
            return authorToReturn
        } catch (err) {
            console.error(err)
            throw new Error(`An error occurred while updating author ${this.asin} in the DB`)
        }
    }
}

export class PaprAudibleBookHelper {
    asin: string
    dbProjection: {}
    bookData!: BookInterface
    options: { seed?: string; update?: string }

    constructor(asin: string, options: { seed?: string; update?: string }) {
        this.asin = asin
        this.options = options
        this.dbProjection = {
            projection: {
                _id: 0,
                asin: 1,
                authors: 1,
                chapterInfo: 1,
                description: 1,
                formatType: 1,
                genres: 1,
                image: 1,
                language: 1,
                narrators: 1,
                publisherName: 1,
                rating: 1,
                releaseDate: 1,
                runtimeLengthMin: 1,
                seriesPrimary: 1,
                seriesSecondary: 1,
                subtitle: 1,
                summary: 1,
                title: 1
            }
        }
    }

    async create() {
        try {
            const bookToReturn = await Book.insertOne(this.bookData)
            return {
                data: bookToReturn,
                modified: true
            }
        } catch (err) {
            throw new Error(err as string)
        }
    }

    async delete() {
        try {
            const deletedBook = await Book.deleteOne({ asin: this.asin })
            return {
                data: deletedBook,
                modified: true
            }
        } catch (err) {
            throw new Error(err as string)
        }
    }

    async find() {}

    async findOne() {
        const findOneBook = await Book.findOne(
            {
                asin: this.asin
            },
            this.dbProjection
        )
        return {
            data: findOneBook,
            modified: false
        }
    }

    async createOrUpdate() {
        const commonHelpers = new SharedHelper()
        const findInDb = await this.findOne()

        // Update
        if (this.options.update === '0' && findInDb.data) {
            // If the objects are the exact same return right away
            commonHelpers.checkDataEquality(findInDb.data, this.bookData)
            // Check state of existing book
            // Only update if either genres exist and can be checked
            // -or if genres exist on new item but not old
            if (findInDb.data.genres || (!findInDb.data.genres && this.bookData.genres)) {
                // Only update if it's not nuked data
                if (this.bookData.genres && this.bookData.genres.length) {
                    console.log(`Updating book asin ${this.asin}`)
                    // Update
                    try {
                        const updatedBook = await this.update()
                        return updatedBook
                    } catch (err) {
                        throw new Error(err as string)
                    }
                }
            } else if (this.bookData.genres && this.bookData.genres.length) {
                // If no genres exist on book, but do on incoming, update
                console.log(`Updating book asin ${this.asin}`)
                // Update
                try {
                    const updatedBook = await this.update()
                    return updatedBook
                } catch (err) {
                    throw new Error(err as string)
                }
            }
            // No update performed, return original
            return findInDb
        }

        // Create
        try {
            const createdBook = await this.create()
            return createdBook
        } catch (err) {
            console.error(err)
            throw new Error(`An error occurred while creating book ${this.asin} in the DB`)
        }
    }

    async update() {
        try {
            await Book.updateOne({ asin: this.asin }, { $set: this.bookData })
            // After updating, return with specific projection
            const bookToReturn = await this.findOne()
            return bookToReturn
        } catch (err) {
            console.error(err)
            throw new Error(`An error occurred while updating book ${this.asin} in the DB`)
        }
        }
    }
}
