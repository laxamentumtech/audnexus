import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'

import { createMockLogger } from '#tests/setup/mockLogger'

const mockUpdateOne = mock()
const mockFindOne = mock()
const mockInsertOne = mock()
const mockDeleteOne = mock()
const mockFind = mock()

mock.module('#config/models/Book', () => ({
	default: {
		updateOne: mockUpdateOne,
		findOne: mockFindOne,
		insertOne: mockInsertOne,
		deleteOne: mockDeleteOne,
		find: mockFind
	}
}))

const mockIsEqualData = mock()

mock.module('#helpers/utils/shared', () => ({
	default: class SharedHelper {
		isEqualData = mockIsEqualData
	}
}))

import type { FastifyBaseLogger } from 'fastify'

import type { BookDocument } from '#config/models/Book'
import { ApiQueryString } from '#config/types'
import * as checkers from '#config/typing/checkers'
import PaprAudibleBookHelper from '#helpers/database/papr/audible/PaprAudibleBookHelper'
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
	mockUpdateOne.mockReset()
	mockFindOne.mockReset()
	mockInsertOne.mockReset()
	mockDeleteOne.mockReset()
	mockFind.mockReset()
	mockIsEqualData.mockReset()
	asin = parsedBook.asin
	options = {
		region: 'us',
		seedAuthors: undefined,
		update: '1'
	}
	helper = new PaprAudibleBookHelper(asin, options)

	mockUpdateOne.mockResolvedValue({
		acknowledged: true,
		matchedCount: 1,
		modifiedCount: 1,
		upsertedCount: 0,
		upsertedId: bookWithoutProjection._id
	})
	mockFindOne.mockResolvedValue(bookWithoutProjection)
	mockInsertOne.mockResolvedValue(bookWithoutProjection)
	spyOn(checkers, 'isBookDocument').mockReturnValue(true)
})

describe('PaprAudibleBookHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.options).toBe(options)
	})
	test('create', async () => {
		const obj = { data: parsedBook, modified: true }
		mockFindOne.mockResolvedValueOnce(parsedBook as unknown as BookDocument)
		helper.setData(parsedBook)

		await expect(helper.create()).resolves.toEqual(obj)
		expect(mockInsertOne).toHaveBeenCalledWith(parsedBook)
		expect(mockFindOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('delete', async () => {
		const obj = { data: { acknowledged: true, deletedCount: 1 }, modified: true }
		mockDeleteOne.mockResolvedValue(obj.data)
		await expect(helper.delete()).resolves.toEqual(obj)
		expect(mockDeleteOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOne', async () => {
		const obj = { data: bookWithoutProjection, modified: false }
		await expect(helper.findOne()).resolves.toEqual(obj)
		expect(mockFindOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOne returns null if it is not a BookDocument', async () => {
		const obj = { data: null, modified: false }
		mockFindOne.mockResolvedValueOnce(null)
		spyOn(checkers, 'isBookDocument').mockReturnValueOnce(false)
		await expect(helper.findOne()).resolves.toEqual(obj)
		expect(mockFindOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOneWithProjection', async () => {
		const obj = { data: parsedBook, modified: false }
		mockFindOne.mockResolvedValue(parsedBook as unknown as BookDocument)
		await expect(helper.findOneWithProjection()).resolves.toEqual(obj)
		expect(mockFindOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOneWithProjection returns null if it is not a Book', async () => {
		const obj = { data: null, modified: false }
		mockFindOne.mockResolvedValueOnce(null)
		await expect(helper.findOneWithProjection()).resolves.toEqual(obj)
		expect(mockFindOne).toHaveBeenCalledWith({
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
		mockFindOne
			.mockResolvedValueOnce(parsedBook as unknown as BookDocument)
			.mockResolvedValueOnce(bookWithoutProjection)
			.mockResolvedValue(parsedBook as unknown as BookDocument)
		helper.setData(parsedBook)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate finds identical update data', async () => {
		const obj = { data: parsedBook, modified: false }
		mockFindOne.mockResolvedValue(parsedBook as unknown as BookDocument)
		mockIsEqualData.mockReturnValue(true)
		helper.setData(parsedBook)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate needs to create', async () => {
		const obj = { data: parsedBook, modified: true }
		mockFindOne.mockResolvedValueOnce(null)
		mockFindOne.mockResolvedValue(bookWithoutProjection)
		helper.setData(parsedBook)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate difference in genres', async () => {
		const obj = { data: parsedBook, modified: true }
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(parsedBook as unknown as BookDocument)
			.mockResolvedValueOnce(bookWithoutProjection)
			.mockResolvedValue(parsedBook as unknown as BookDocument)
		helper.setData(parsedBook)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate genres on old, but not on new', async () => {
		const obj = { data: parsedBook, modified: false }
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(parsedBook as unknown as BookDocument)
			.mockResolvedValueOnce(bookWithoutProjection)
			.mockResolvedValue(parsedBook as unknown as BookDocument)
		helper.setData(parsedBookWithoutGenres)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate no genres on new or old', async () => {
		const obj = { data: parsedBookWithoutGenres, modified: false }
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(parsedBookWithoutGenres as unknown as BookDocument)
			.mockResolvedValueOnce(bookWithoutGenresWithoutProjection)
			.mockResolvedValue(parsedBookWithoutGenres as unknown as BookDocument)
		helper.setData(parsedBookWithoutGenres)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('update', async () => {
		const obj = { data: parsedBook, modified: true }
		helper.setData(parsedBook)
		mockFindOne.mockResolvedValueOnce(bookWithoutProjection)
		mockFindOne.mockResolvedValue(parsedBook as unknown as BookDocument)
		await expect(helper.update()).resolves.toEqual(obj)
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin: asin, $or: [{ region: { $exists: false } }, { region: options.region }] },
			{
				$set: { ...parsedBook, createdAt: bookWithoutProjection._id.getTimestamp() },
				$currentDate: { updatedAt: true }
			}
		)
	})
})

describe('PaprAudibleBookHelper should catch error when', () => {
	test('create', async () => {
		mockInsertOne.mockRejectedValue(new Error('error'))
		helper.setData(parsedBook)
		await expect(helper.create()).rejects.toThrow(
			`An error occurred while creating book ${asin} in the DB`
		)
	})
	test('delete', async () => {
		mockDeleteOne.mockRejectedValue(new Error('error'))
		await expect(helper.delete()).rejects.toThrow(
			`An error occurred while deleting book ${asin} in the DB`
		)
	})
	test('update did not find existing', async () => {
		mockFindOne.mockResolvedValueOnce(null)
		helper.setData(parsedBook)
		await expect(helper.update()).rejects.toThrow(
			`An error occurred while updating book ${asin} in the DB`
		)
	})
	test('update', async () => {
		mockUpdateOne.mockRejectedValue(new Error('error'))
		helper.setData(parsedBook)
		await expect(helper.update()).rejects.toThrow(
			`An error occurred while updating book ${asin} in the DB`
		)
	})
})

describe('PaprAudibleBookHelper should log error when', () => {
	test('create logs error on BookModel.insertOne failure', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleBookHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)
		helperWithLogger.setData(parsedBook)
		mockInsertOne.mockRejectedValue(new Error('DB error'))
		await expect(helperWithLogger.create()).rejects.toThrow(
			`An error occurred while creating book ${asin} in the DB`
		)
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})

	test('delete logs error on BookModel.deleteOne failure', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleBookHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)
		mockDeleteOne.mockRejectedValue(new Error('DB error'))
		await expect(helperWithLogger.delete()).rejects.toThrow(
			`An error occurred while deleting book ${asin} in the DB`
		)
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})

	test('update logs error when BookModel.findOne returns null (not found)', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleBookHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)
		helperWithLogger.setData(parsedBook)
		mockFindOne.mockResolvedValueOnce(null)
		await expect(helperWithLogger.update()).rejects.toThrow(
			`An error occurred while updating book ${asin} in the DB`
		)
		expect(mockLogger.error).toHaveBeenCalledWith(`Book ${asin} not found in the DB for update`)
	})

	test('update logs error on BookModel.updateOne failure', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleBookHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)
		helperWithLogger.setData(parsedBook)
		mockFindOne.mockResolvedValueOnce(bookWithoutProjection)
		mockUpdateOne.mockRejectedValue(new Error('DB error'))
		await expect(helperWithLogger.update()).rejects.toThrow(
			`An error occurred while updating book ${asin} in the DB`
		)
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})
})

describe('PaprAudibleBookHelper should log info when', () => {
	test('createOrUpdate logs NoticeUpdateAsin when update=1, data differs, and genres non-empty', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleBookHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)

		mockIsEqualData.mockReturnValue(false)

		mockFindOne
			.mockResolvedValueOnce(parsedBook as unknown as BookDocument)
			.mockResolvedValueOnce(bookWithoutProjection)
			.mockResolvedValue(parsedBook as unknown as BookDocument)

		helperWithLogger.setData(parsedBook)

		const result = await helperWithLogger.createOrUpdate()

		expect(mockLogger.info).toHaveBeenCalledWith(`Updating book ASIN ${asin}`)
		expect(result.modified).toBe(true)
	})
})

afterAll(() => {
	mock.restore()
})
