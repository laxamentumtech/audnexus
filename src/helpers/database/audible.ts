import Author from '#config/models/Author'
import Chapter from '#config/models/Chapter'
import SharedHelper from '#helpers/shared'
import { ApiChapterInterface, BookInterface } from '#interfaces/books'
import { AuthorProfile } from '#interfaces/people'
import Book from '#config/models/Book'

export class PaprAudibleAuthorHelper {
    asin: string
    authorData!: AuthorProfile
    options: { update?: string }

    constructor(asin: string, options: { update?: string }) {
        this.asin = asin
        this.options = options
    }

    async create() {
        try {
            const authorToReturn = await Author.insertOne(this.authorData)
            return {
                data: authorToReturn,
                modified: true
            }
        } catch (err) {
            console.error(err)
            throw new Error(`An error occurred while creating author ${this.asin} in the DB`)
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

    async findOne() {
        const findOneAuthor = await Author.findOne({
            asin: this.asin
        })
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
                    return this.update()
                }
            } else if (this.authorData.genres && this.authorData.genres.length) {
                // If no genres exist on author, but do on incoming, update
                console.log(`Updating author asin ${this.asin}`)
                // Update

                return this.update()
            }
            // No update performed, return original
            return findInDb
        }

        // Create
        return this.create()
    }

    async update() {
        try {
            await Author.updateOne({ asin: this.asin }, { $set: { ...this.authorData } })
            // After updating, return with specific projection
            return await this.findOne()
        } catch (err) {
            console.error(err)
            throw new Error(`An error occurred while updating author ${this.asin} in the DB`)
        }
    }
}

export class PaprAudibleBookHelper {
    asin: string
    bookData!: BookInterface
    options: { seed?: string; update?: string }

    constructor(asin: string, options: { seed?: string; update?: string }) {
        this.asin = asin
        this.options = options
    }

    async create() {
        try {
            const bookToReturn = await Book.insertOne(this.bookData)
            return {
                data: bookToReturn,
                modified: true
            }
        } catch (err) {
            console.error(err)
            throw new Error(`An error occurred while creating book ${this.asin} in the DB`)
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

    async findOne() {
        const findOneBook = await Book.findOne({
            asin: this.asin
        })
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
                    return this.update()
                }
            } else if (this.bookData.genres && this.bookData.genres.length) {
                // If no genres exist on book, but do on incoming, update
                console.log(`Updating book asin ${this.asin}`)
                // Update
                return this.update()
            }
            // No update performed, return original
            return findInDb
        }

        // Create
        return this.create()
    }

    async update() {
        try {
            await Book.updateOne({ asin: this.asin }, { $set: { ...this.bookData } })
            // After updating, return with specific projection
            return await this.findOne()
        } catch (err) {
            console.error(err)
            throw new Error(`An error occurred while updating book ${this.asin} in the DB`)
        }
    }
}

export class PaprAudibleChapterHelper {
    asin: string
    chapterData!: ApiChapterInterface
    options: { update?: string }

    constructor(asin: string, options: { update?: string }) {
        this.asin = asin
        this.options = options
    }

    async create() {
        try {
            const chapterToReturn = await Chapter.insertOne(this.chapterData)
            return {
                data: chapterToReturn,
                modified: true
            }
        } catch (err) {
            console.error(err)
            throw new Error(`An error occurred while creating chapter ${this.asin} in the DB`)
        }
    }

    async delete() {
        try {
            const deletedChapter = await Chapter.deleteOne({ asin: this.asin })
            return {
                data: deletedChapter,
                modified: true
            }
        } catch (err) {
            throw new Error(err as string)
        }
    }

    async findOne() {
        const findOneChapter = await Chapter.findOne({
            asin: this.asin
        })
        return {
            data: findOneChapter,
            modified: false
        }
    }

    async createOrUpdate() {
        const commonHelpers = new SharedHelper()
        const findInDb = await this.findOne()

        // Update
        if (this.options.update === '0' && findInDb.data) {
            // If the objects are the exact same return right away
            commonHelpers.checkDataEquality(findInDb.data, this.chapterData)
            if (this.chapterData.chapters && this.chapterData.chapters.length) {
                console.log(`Updating chapters for asin ${this.asin}`)
                // Update
                return this.update()
            }
            // No update performed, return original
            return findInDb
        }

        // Create
        return this.create()
    }

    async update() {
        try {
            await Chapter.updateOne({ asin: this.asin }, { $set: { ...this.chapterData } })
            // After updating, return with specific projection
            return await this.findOne()
        } catch (err) {
            console.error(err)
            throw new Error(`An error occurred while updating chapter ${this.asin} in the DB`)
        }
    }
}
