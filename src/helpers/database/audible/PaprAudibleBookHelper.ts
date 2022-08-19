import BookModel from '#config/models/Book'
import { Book } from '#config/typing/books'
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

	async create() {
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

	async delete() {
		try {
			const deletedBook = await BookModel.deleteOne({ asin: this.asin })
			return {
				data: deletedBook,
				modified: true
			}
		} catch (err) {
			throw new Error(err as string)
		}
	}

	async findOne() {
		const findOneBook = await BookModel.findOne({
			asin: this.asin
		})
		return {
			data: findOneBook,
			modified: false
		}
	}

	async findOneWithProjection() {
		const findOneBook = (await BookModel.findOne(
			{
				asin: this.asin
			},
			{ projection: projectionWithoutDbFields }
		)) as unknown as Book
		return {
			data: findOneBook,
			modified: false
		}
	}

	setBookData(bookData: Book) {
		this.bookData = bookData
	}

	async createOrUpdate() {
		const commonHelpers = new SharedHelper()
		const findInDb = await this.findOneWithProjection()

		// Update
		if (this.options.update === '0' && findInDb.data) {
			// If the objects are the exact same return right away
			const equality = commonHelpers.checkDataEquality(findInDb.data, this.bookData)
			if (equality) {
				return {
					data: findInDb.data,
					modified: false
				}
			}
			// Check state of existing book
			// Only update if either genres exist and can be checked
			// -or if genres exist on new item but not old
			if (findInDb.data.genres || (!findInDb.data.genres && this.bookData.genres)) {
				// Only update if it's not nuked data
				if (this.bookData.genres?.length) {
					console.log(`Updating book asin ${this.asin}`)
					// Update
					return this.update()
				}
			} else if (this.bookData.genres?.length) {
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
			await BookModel.updateOne({ asin: this.asin }, { $set: { ...this.bookData } })
			// After updating, return with specific projection
			return await this.findOneWithProjection()
		} catch (err) {
			console.error(err)
			throw new Error(`An error occurred while updating book ${this.asin} in the DB`)
		}
	}
}
