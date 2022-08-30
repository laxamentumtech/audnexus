import BookModel, { BookDocument } from '#config/models/Book'
import { Book } from '#config/typing/books'
import { isBook, isBookDocument } from '#config/typing/checkers'
import { PaprBookDocumentReturn, PaprBookReturn, PaprDeleteReturn } from '#config/typing/papr'
import { RequestGenericWithSeed } from '#config/typing/requests'
import SharedHelper from '#helpers/shared'

const projectionWithoutDbFields = {
	_id: 0,
	createdAt: 0,
	updatedAt: 0
}

export default class PaprAudibleBookHelper {
	asin: string
	bookData!: Book
	options: RequestGenericWithSeed['Querystring']

	constructor(asin: string, options: RequestGenericWithSeed['Querystring']) {
		this.asin = asin
		this.options = options
	}

	/**
	 * Inserts a new book into the DB
	 * using bookData from the constructor
	 */
	async create(): Promise<PaprBookReturn> {
		try {
			await BookModel.insertOne(this.bookData)
			return {
				data: (await this.findOneWithProjection()).data,
				modified: true
			}
		} catch (err) {
			console.error(err)
			throw new Error(`An error occurred while creating book ${this.asin} in the DB`)
		}
	}

	/**
	 * Deletes a book from the DB
	 * using asin from the constructor
	 */
	async delete(): Promise<PaprDeleteReturn> {
		try {
			const deletedBook = await BookModel.deleteOne({ asin: this.asin })
			return {
				data: deletedBook,
				modified: true
			}
		} catch (err) {
			console.error(err)
			throw new Error(`An error occurred while deleting book ${this.asin} in the DB`)
		}
	}

	/**
	 * Finds a book in the DB
	 * using asin from the constructor.
	 * Returns unaltered Document.
	 */
	async findOne(): Promise<PaprBookDocumentReturn> {
		const findOneBook = await BookModel.findOne({
			asin: this.asin
		})

		// Assign type to book data
		const data: BookDocument | null = isBookDocument(findOneBook) ? findOneBook : null

		return {
			data: data,
			modified: false
		}
	}

	/**
	 * Finds a book in the DB
	 * using asin from the constructor.
	 * Returns altered Document using projection.
	 */
	async findOneWithProjection(): Promise<PaprBookReturn> {
		const findOneBook = await BookModel.findOne(
			{
				asin: this.asin
			},
			{ projection: projectionWithoutDbFields }
		)

		// Assign type to book data
		const data: Book | null = isBook(findOneBook) ? findOneBook : null

		return {
			data: data,
			modified: false
		}
	}

	/**
	 * Set bookData in the class object
	 */
	setBookData(bookData: Book) {
		this.bookData = bookData
	}

	/**
	 * Creates a book if it doesn't exist.
	 *
	 * Updates a existing book if:
	 *
	 * 1. `options.update` is 1 and the book exists
	 * 2. The incoming data is different from the existing data
	 * 3. Genres exist or are different
	 */
	async createOrUpdate(): Promise<PaprBookReturn> {
		const sharedHelper = new SharedHelper()
		const findInDb = await this.findOneWithProjection()

		// Update
		if (this.options.update === '1' && findInDb.data) {
			const data = findInDb.data
			// If the objects are the exact same return right away
			const equality = sharedHelper.checkDataEquality(data, this.bookData)
			if (equality) {
				return {
					data: data,
					modified: false
				}
			}
			// Check state of existing book
			// Only update if either genres exist and can be checked
			// -or if genres exist on new item but not old
			if (data.genres || (!data.genres && this.bookData.genres)) {
				// Only update if it's not nuked data
				if (this.bookData.genres?.length) {
					console.log(`Updating book asin ${this.asin}`)
					// Update
					return this.update()
				}
			}
			// No update performed, return original
			return findInDb
		}

		// Create
		return this.create()
	}

	/**
	 * Updates a book in the DB
	 * using asin from the constructor.
	 * Always sets createdAt and updatedAt fields.
	 * Returns altered Document using findOneWithProjection.
	 */
	async update(): Promise<PaprBookReturn> {
		try {
			const found = await this.findOne()
			await BookModel.updateOne(
				{ asin: this.asin },
				{
					$set: { ...this.bookData, createdAt: found.data?._id.getTimestamp() },
					$currentDate: { updatedAt: true }
				}
			)
			// After updating, return with specific projection
			const updatedBook = await this.findOneWithProjection()
			// Set modified to true to indicate that the data has been updated
			updatedBook.modified = true
			return updatedBook
		} catch (err) {
			console.error(err)
			throw new Error(`An error occurred while updating book ${this.asin} in the DB`)
		}
	}
}
