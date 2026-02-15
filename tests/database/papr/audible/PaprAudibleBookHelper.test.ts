jest.mock('#config/models/Book')
jest.mock('#helpers/utils/shared')

import type { FastifyBaseLogger } from 'fastify'

import BookModel, { BookDocument } from '#config/models/Book'
import { ApiQueryString } from '#config/types'
import * as checkers from '#config/typing/checkers'
import PaprAudibleBookHelper from '#helpers/database/papr/audible/PaprAudibleBookHelper'
import SharedHelper from '#helpers/utils/shared'
import {
	bookWithoutGenresWithoutProjection,
	bookWithoutProjection,
	parsedBook,
	parsedBookWithoutGenres
} from '#tests/datasets/helpers/books'

let asin: string
let helper: PaprAudibleBookHelper
let options: ApiQueryString

beforeEach(() => {
	asin = parsedBook.asin
	options = {
		region: 'us',
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
		helper.setData(parsedBook)

		await expect(helper.create()).resolves.toEqual(obj)
		expect(BookModel.insertOne).toHaveBeenCalledWith(parsedBook)
		expect(BookModel.findOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('delete', async () => {
		const obj = { data: { acknowledged: true, deletedCount: 1 }, modified: true }
		jest.spyOn(BookModel, 'deleteOne').mockResolvedValue(obj.data)
		await expect(helper.delete()).resolves.toEqual(obj)
		expect(BookModel.deleteOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOne', async () => {
		const obj = { data: bookWithoutProjection, modified: false }
		await expect(helper.findOne()).resolves.toEqual(obj)
		expect(BookModel.findOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOne returns null if it is not a BookDocument', async () => {
		const obj = { data: null, modified: false }
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(null)
		jest.spyOn(checkers, 'isBookDocument').mockReturnValueOnce(false)
		await expect(helper.findOne()).resolves.toEqual(obj)
		expect(BookModel.findOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOneWithProjection', async () => {
		const obj = { data: parsedBook, modified: false }
		jest.spyOn(BookModel, 'findOne').mockResolvedValue(parsedBook as unknown as BookDocument)
		await expect(helper.findOneWithProjection()).resolves.toEqual(obj)
		expect(BookModel.findOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOneWithProjection returns null if it is not a Book', async () => {
		const obj = { data: null, modified: false }
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(null)
		await expect(helper.findOneWithProjection()).resolves.toEqual(obj)
		expect(BookModel.findOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('setData', () => {
		const bookData = parsedBook
		helper.setData(bookData)
		expect(helper.bookData).toBe(bookData)
	})
	test('createOrUpdate finds one to update', async () => {
		const obj = { data: parsedBook, modified: true }
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(parsedBook as unknown as BookDocument)
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(bookWithoutProjection)
		jest.spyOn(BookModel, 'findOne').mockResolvedValue(parsedBook as unknown as BookDocument)
		helper.setData(parsedBook)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate finds identical update data', async () => {
		const obj = { data: parsedBook, modified: false }
		jest.spyOn(BookModel, 'findOne').mockResolvedValue(parsedBook as unknown as BookDocument)
		jest.spyOn(SharedHelper.prototype, 'isEqualData').mockReturnValue(true)
		helper.setData(parsedBook)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate needs to create', async () => {
		const obj = { data: parsedBook, modified: true }
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(null)
		jest.spyOn(BookModel, 'findOne').mockResolvedValue(bookWithoutProjection)
		helper.setData(parsedBook)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate difference in genres', async () => {
		const obj = { data: parsedBook, modified: true }
		jest.spyOn(SharedHelper.prototype, 'isEqualData').mockReturnValue(false)
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(parsedBook as unknown as BookDocument)
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(bookWithoutProjection)
		jest.spyOn(BookModel, 'findOne').mockResolvedValue(parsedBook as unknown as BookDocument)
		helper.setData(parsedBook)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate genres on old, but not on new', async () => {
		const obj = { data: parsedBook, modified: false }
		jest.spyOn(SharedHelper.prototype, 'isEqualData').mockReturnValue(false)
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(parsedBook as unknown as BookDocument)
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(bookWithoutProjection)
		jest.spyOn(BookModel, 'findOne').mockResolvedValue(parsedBook as unknown as BookDocument)
		helper.setData(parsedBookWithoutGenres)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate no genres on new or old', async () => {
		const obj = { data: parsedBookWithoutGenres, modified: false }
		jest.spyOn(SharedHelper.prototype, 'isEqualData').mockReturnValue(false)
		jest
			.spyOn(BookModel, 'findOne')
			.mockResolvedValueOnce(parsedBookWithoutGenres as unknown as BookDocument)
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(bookWithoutGenresWithoutProjection)
		jest
			.spyOn(BookModel, 'findOne')
			.mockResolvedValue(parsedBookWithoutGenres as unknown as BookDocument)
		helper.setData(parsedBookWithoutGenres)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('update', async () => {
		const obj = { data: parsedBook, modified: true }
		helper.setData(parsedBook)
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(bookWithoutProjection)
		jest.spyOn(BookModel, 'findOne').mockResolvedValue(parsedBook as unknown as BookDocument)
		await expect(helper.update()).resolves.toEqual(obj)
		expect(BookModel.updateOne).toHaveBeenCalledWith(
			{ asin: asin, $or: [{ region: { $exists: false } }, { region: options.region }] },
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
		helper.setData(parsedBook)
		await expect(helper.create()).rejects.toThrow(
			`An error occurred while creating book ${asin} in the DB`
		)
	})
	test('delete', async () => {
		jest.spyOn(BookModel, 'deleteOne').mockRejectedValue(new Error('error'))
		await expect(helper.delete()).rejects.toThrow(
			`An error occurred while deleting book ${asin} in the DB`
		)
	})
	test('update did not find existing', async () => {
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(null)
		helper.setData(parsedBook)
		await expect(helper.update()).rejects.toThrow(
			`An error occurred while updating book ${asin} in the DB`
		)
	})
	test('update', async () => {
		jest.spyOn(BookModel, 'updateOne').mockRejectedValue(new Error('error'))
		helper.setData(parsedBook)
		await expect(helper.update()).rejects.toThrow(
			`An error occurred while updating book ${asin} in the DB`
		)
	})
})

describe('PaprAudibleBookHelper should log error when', () => {
	test('create logs error on BookModel.insertOne failure', async () => {
		const mockLogger = { error: jest.fn(), info: jest.fn() }
		const helperWithLogger = new PaprAudibleBookHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)
		helperWithLogger.setData(parsedBook)
		jest.spyOn(BookModel, 'insertOne').mockRejectedValue(new Error('DB error'))
		await expect(helperWithLogger.create()).rejects.toThrow(
			`An error occurred while creating book ${asin} in the DB`
		)
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})

	test('delete logs error on BookModel.deleteOne failure', async () => {
		const mockLogger = { error: jest.fn(), info: jest.fn() }
		const helperWithLogger = new PaprAudibleBookHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)
		jest.spyOn(BookModel, 'deleteOne').mockRejectedValue(new Error('DB error'))
		await expect(helperWithLogger.delete()).rejects.toThrow(
			`An error occurred while deleting book ${asin} in the DB`
		)
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})

	test('update logs error when BookModel.findOne returns null (not found)', async () => {
		const mockLogger = { error: jest.fn(), info: jest.fn() }
		const helperWithLogger = new PaprAudibleBookHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)
		helperWithLogger.setData(parsedBook)
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(null)
		await expect(helperWithLogger.update()).rejects.toThrow(
			`An error occurred while updating book ${asin} in the DB`
		)
		expect(mockLogger.error).toHaveBeenCalledWith(`Book ${asin} not found in the DB for update`)
	})

	test('update logs error on BookModel.updateOne failure', async () => {
		const mockLogger = { error: jest.fn(), info: jest.fn() }
		const helperWithLogger = new PaprAudibleBookHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)
		helperWithLogger.setData(parsedBook)
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(bookWithoutProjection)
		jest.spyOn(BookModel, 'updateOne').mockRejectedValue(new Error('DB error'))
		await expect(helperWithLogger.update()).rejects.toThrow(
			`An error occurred while updating book ${asin} in the DB`
		)
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})
})

describe('PaprAudibleBookHelper should log info when', () => {
	test('createOrUpdate logs NoticeUpdateAsin when update=1, data differs, and genres non-empty', async () => {
		const mockLogger = { error: jest.fn(), info: jest.fn() }
		const helperWithLogger = new PaprAudibleBookHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)

		// Setup: data differs (isEqual returns false)
		jest.spyOn(SharedHelper.prototype, 'isEqualData').mockReturnValue(false)

		// Setup: findOneWithProjection returns book with genres (existing book)
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(parsedBook as unknown as BookDocument)
		// Setup: findOne for update returns bookWithoutProjection
		jest.spyOn(BookModel, 'findOne').mockResolvedValueOnce(bookWithoutProjection)
		// Setup: findOneWithProjection after update returns parsedBook
		jest.spyOn(BookModel, 'findOne').mockResolvedValue(parsedBook as unknown as BookDocument)

		// Set data with genres (non-empty)
		helperWithLogger.setData(parsedBook)

		const result = await helperWithLogger.createOrUpdate()

		// Verify logger.info was called with NoticeUpdateAsin result
		expect(mockLogger.info).toHaveBeenCalledWith(`Updating book ASIN ${asin}`)
		expect(result.modified).toBe(true)
	})
})
