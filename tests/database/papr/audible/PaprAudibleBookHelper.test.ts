jest.mock('#config/models/Book')
jest.mock('#helpers/shared')

import BookModel, { BookDocument } from '#config/models/Book'
import * as checkers from '#config/typing/checkers'
import { RequestGenericWithSeed } from '#config/typing/requests'
import PaprAudibleBookHelper from '#helpers/database/papr/audible/PaprAudibleBookHelper'
import SharedHelper from '#helpers/shared'
import {
	bookWithoutGenresWithoutProjection,
	bookWithoutProjection,
	parsedBook,
	parsedBookWithoutGenres
} from '#tests/datasets/helpers/books'

let asin: string
let helper: PaprAudibleBookHelper
let options: RequestGenericWithSeed['Querystring']

const projectionWithoutDbFields = {
	_id: 0,
	createdAt: 0,
	updatedAt: 0
}

beforeEach(() => {
	asin = parsedBook.asin
	options = {
		seedAuthors: undefined,
		update: '1'
	}
	helper = new PaprAudibleBookHelper(asin, options)

	jest.spyOn(BookModel, 'updateOne').mockResolvedValue({
		acknowledged: true,
		matchedCount: 1,
		modifiedCount: 1,
		upsertedCount: 0,
		upsertedId: bookWithoutProjection._id
	})
	jest.spyOn(BookModel, 'findOne').mockResolvedValue(bookWithoutProjection)
	jest.spyOn(BookModel, 'insertOne').mockResolvedValue(bookWithoutProjection)
	jest.spyOn(checkers, 'isBook').mockReturnValue(true)
	jest.spyOn(checkers, 'isBookDocument').mockReturnValue(true)
})

describe('PaprAudibleBookHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.options).toBe(options)
	})
	test('create', async () => {
		const obj = { data: parsedBook, modified: true }
		jest.spyOn(BookModel, 'findOne').mockResolvedValue(parsedBook as unknown as BookDocument)
		helper.setBookData(parsedBook)

		await expect(helper.create()).resolves.toEqual(obj)
		expect(BookModel.insertOne).toHaveBeenCalledWith(parsedBook)
		expect(BookModel.findOne).toHaveBeenCalledWith(
			{ asin: asin },
			{ projection: projectionWithoutDbFields }
		)
	})
	test('delete', async () => {
		const obj = { data: { acknowledged: true, deletedCount: 1 }, modified: true }
		jest.spyOn(BookModel, 'deleteOne').mockResolvedValue(obj.data)
		await expect(helper.delete()).resolves.toEqual(obj)
		expect(BookModel.deleteOne).toHaveBeenCalledWith({ asin: asin })
	})
	test('findOne', async () => {
		const obj = { data: bookWithoutProjection, modified: false }
		await expect(helper.findOne()).resolves.toEqual(obj)
		expect(BookModel.findOne).toHaveBeenCalledWith({ asin: asin })
	})
	test('findOne returns null if it is not a BookDocument', async () => {
		const obj = { data: null, modified: false }
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(null)
		jest.spyOn(checkers, 'isBookDocument').mockReturnValueOnce(false)
		await expect(helper.findOne()).resolves.toEqual(obj)
		expect(BookModel.findOne).toHaveBeenCalledWith({ asin: asin })
	})
	test('findOneWithProjection', async () => {
		const obj = { data: parsedBook, modified: false }
		jest.spyOn(BookModel, 'findOne').mockResolvedValue(parsedBook as unknown as BookDocument)
		await expect(helper.findOneWithProjection()).resolves.toEqual(obj)
		expect(BookModel.findOne).toHaveBeenCalledWith(
			{ asin: asin },
			{ projection: projectionWithoutDbFields }
		)
	})
	test('findOneWithProjection returns null if it is not a Book', async () => {
		const obj = { data: null, modified: false }
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(null)
		jest.spyOn(checkers, 'isBook').mockReturnValueOnce(false)
		await expect(helper.findOneWithProjection()).resolves.toEqual(obj)
		expect(BookModel.findOne).toHaveBeenCalledWith(
			{ asin: asin },
			{ projection: projectionWithoutDbFields }
		)
	})
	test('setBookData', () => {
		const bookData = parsedBook
		helper.setBookData(bookData)
		expect(helper.bookData).toBe(bookData)
	})
	test('createOrUpdate finds one to update', async () => {
		const obj = { data: parsedBook, modified: true }
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(parsedBook as unknown as BookDocument)
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(bookWithoutProjection)
		jest.spyOn(BookModel, 'findOne').mockResolvedValue(parsedBook as unknown as BookDocument)
		helper.setBookData(parsedBook)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate finds identical update data', async () => {
		const obj = { data: parsedBook, modified: false }
		jest.spyOn(BookModel, 'findOne').mockResolvedValue(parsedBook as unknown as BookDocument)
		jest.spyOn(SharedHelper.prototype, 'checkDataEquality').mockReturnValue(true)
		helper.setBookData(parsedBook)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate needs to create', async () => {
		const obj = { data: parsedBook, modified: true }
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(null)
		jest.spyOn(BookModel, 'findOne').mockResolvedValue(parsedBook as unknown as BookDocument)
		helper.setBookData(parsedBook)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate difference in genres', async () => {
		const obj = { data: parsedBook, modified: true }
		jest.spyOn(SharedHelper.prototype, 'checkDataEquality').mockReturnValue(false)
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(parsedBook as unknown as BookDocument)
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(bookWithoutProjection)
		jest.spyOn(BookModel, 'findOne').mockResolvedValue(parsedBook as unknown as BookDocument)
		helper.setBookData(parsedBook)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate genres on old, but not on new', async () => {
		const obj = { data: parsedBook, modified: false }
		jest.spyOn(SharedHelper.prototype, 'checkDataEquality').mockReturnValue(false)
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(parsedBook as unknown as BookDocument)
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(bookWithoutProjection)
		jest.spyOn(BookModel, 'findOne').mockResolvedValue(parsedBook as unknown as BookDocument)
		helper.setBookData(parsedBookWithoutGenres)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate no genres on new or old', async () => {
		const obj = { data: parsedBookWithoutGenres, modified: false }
		jest.spyOn(SharedHelper.prototype, 'checkDataEquality').mockReturnValue(false)
		jest
			.spyOn(BookModel, 'findOne')
			.mockResolvedValueOnce(parsedBookWithoutGenres as unknown as BookDocument)
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(bookWithoutGenresWithoutProjection)
		jest
			.spyOn(BookModel, 'findOne')
			.mockResolvedValue(parsedBookWithoutGenres as unknown as BookDocument)
		helper.setBookData(parsedBookWithoutGenres)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('update', async () => {
		const obj = { data: parsedBook, modified: true }
		helper.setBookData(parsedBook)
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(bookWithoutProjection)
		jest.spyOn(BookModel, 'findOne').mockResolvedValue(parsedBook as unknown as BookDocument)
		await expect(helper.update()).resolves.toEqual(obj)
		expect(BookModel.updateOne).toHaveBeenCalledWith(
			{ asin: asin },
			{
				$set: { ...parsedBook, createdAt: bookWithoutProjection?._id.getTimestamp() },
				$currentDate: { updatedAt: true }
			}
		)
	})
})

describe('PaprAudibleBookHelper should catch error when', () => {
	test('create', async () => {
		jest.spyOn(BookModel, 'insertOne').mockRejectedValue(new Error('error'))
		helper.setBookData(parsedBook)
		await expect(helper.create()).rejects.toThrowError(
			`An error occurred while creating book ${asin} in the DB`
		)
	})
	test('delete', async () => {
		jest.spyOn(BookModel, 'deleteOne').mockRejectedValue(new Error('error'))
		await expect(helper.delete()).rejects.toThrowError(
			`An error occurred while deleting book ${asin} in the DB`
		)
	})
	test('update did not find existing', async () => {
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(null)
		helper.setBookData(parsedBook)
		await expect(helper.update()).rejects.toThrowError(
			`An error occurred while updating book ${asin} in the DB`
		)
	})
	test('update', async () => {
		jest.spyOn(BookModel, 'updateOne').mockRejectedValue(new Error('error'))
		helper.setBookData(parsedBook)
		await expect(helper.update()).rejects.toThrowError(
			`An error occurred while updating book ${asin} in the DB`
		)
	})
})
