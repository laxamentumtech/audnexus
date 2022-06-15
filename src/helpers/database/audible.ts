import SharedHelper from '#helpers/shared'
import { BookInterface } from '#interfaces/books'
import Book from '#models/Book'

class PaprAudibleHelper {
    asin: string
    dbProjection: {}
    bookData!: BookInterface
    options: { seed: string | undefined; update: string | undefined }

    constructor(asin: string, options: { seed: string | undefined; update: string | undefined }) {
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
            // TODO write errors
            throw new Error(``)
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
                    console.log(`Updating asin ${this.asin}`)
                    // Update
                    return this.update()
                }
            } else if (this.bookData.genres && this.bookData.genres.length) {
                // If no genres exist on book, but do on incoming, update
                console.log(`Updating asin ${this.asin}`)
                // Update
                return this.update()
            }
            // No update performed, return original
            return findInDb
        }

        // Create
        const createdBook = await this.create()
        return createdBook
    }

    async update() {
        try {
            await Book.updateOne({ asin: this.asin }, { $set: this.bookData })
            // After updating, return with specific projection
            const bookToReturn = await this.findOne()
            return bookToReturn
        } catch (err) {
            // TODO write errors
            throw new Error()
        }
    }
}

export default PaprAudibleHelper
