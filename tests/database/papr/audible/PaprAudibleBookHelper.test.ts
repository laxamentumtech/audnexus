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
	parsedBookWithoutGenres,
	ratings
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
	test('createOrUpdate preserves stored genres when the incoming data has none', async () => {
		// Ladder-less fetches carry no genre evidence. The update must proceed,
		// not be frozen. The equality check compares the genre-preserving
		// merge (stored genres in the comparator's second argument). The
		// write $set omits `genres` without incoming genre evidence, so the
		// row keeps whatever genres it has and a concurrent genre update is
		// never clobbered by the stale read-time list.
		const obj = { data: parsedBook, modified: true }
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(parsedBook as unknown as BookDocument)
			.mockResolvedValueOnce(bookWithoutProjection)
			.mockResolvedValue(parsedBook as unknown as BookDocument)
		helper.setData(parsedBookWithoutGenres)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
		expect(mockIsEqualData).toHaveBeenCalledTimes(1)
		expect(mockIsEqualData).toHaveBeenCalledWith(
			parsedBook,
			{ ...parsedBookWithoutGenres, genres: parsedBook.genres }
		)
		expect(mockUpdateOne).toHaveBeenCalledTimes(1)
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin: asin, $or: [{ region: { $exists: false } }, { region: options.region }] },
			{
				$set: {
					...parsedBookWithoutGenres,
					createdAt: bookWithoutProjection._id.getTimestamp()
				},
				$unset: { ratingsBackfillSkip: '' },
				$currentDate: { updatedAt: true }
			}
		)
	})
	test('createOrUpdate omits genres from the update payload when incoming carries an empty list and another field changed', async () => {
		// Incoming `genres: []` is not genre evidence, but the ratings
		// change means the equality short-circuit fails (the comparator is
		// mocked false, as in the genre-difference test). The update must
		// proceed, and its $set must not carry `genres` — the stored
		// nonempty genre list survives the write.
		const incoming = { ...parsedBookWithoutGenres, genres: [], ratings: { ...ratings } }
		const obj = { data: parsedBook, modified: true }
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(parsedBook as unknown as BookDocument)
			.mockResolvedValueOnce(bookWithoutProjection)
			.mockResolvedValue(parsedBook as unknown as BookDocument)
		helper.setData(incoming)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
		expect(mockIsEqualData).toHaveBeenCalledTimes(1)
		expect(mockUpdateOne).toHaveBeenCalledTimes(1)
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin: asin, $or: [{ region: { $exists: false } }, { region: options.region }] },
			{
				$set: { ...parsedBookWithoutGenres, ratings: { ...ratings }, createdAt: bookWithoutProjection._id.getTimestamp() },
				$unset: { ratingsBackfillSkip: '' },
				$currentDate: { updatedAt: true }
			}
		)
		const updatePayload = mockUpdateOne.mock.calls[0]?.[1]
		expect(updatePayload).toBeDefined()
		if (updatePayload && typeof updatePayload === 'object' && '$set' in updatePayload) {
			expect(updatePayload.$set).not.toHaveProperty('genres')
		}
	})
	test('createOrUpdate short-circuits when the merged comparison document equals the stored row', async () => {
		// Stored row has genres, incoming is identical except `genres: []`.
		// The comparison runs against the genre-preserving merge (stored
		// genres in the comparator's second argument), which equals the
		// stored row: modified: false, no write.
		const incoming = { ...parsedBookWithoutGenres, genres: [] }
		const obj = { data: parsedBook, modified: false }
		mockIsEqualData.mockReturnValue(true)
		mockFindOne.mockResolvedValue(parsedBook as unknown as BookDocument)
		helper.setData(incoming)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
		expect(mockIsEqualData).toHaveBeenCalledTimes(1)
		expect(mockIsEqualData).toHaveBeenCalledWith(
			parsedBook,
			{ ...incoming, genres: parsedBook.genres }
		)
		expect(mockUpdateOne).not.toHaveBeenCalled()
	})
	test('createOrUpdate short-circuits when both sides carry an empty genre list', async () => {
		// `genres: []` is not genre evidence on either side: an identical
		// genre-less observation compares equal once the empty lists are
		// normalized away, so it stays in the short-circuit (modified:
		// false, no write) instead of a redundant $set on every fetch.
		const incoming = { ...parsedBookWithoutGenres, genres: [] }
		const stored: BookDocument = {
			...bookWithoutProjection,
			genres: []
		}
		// The short-circuit returns the stored projection as-is, which
		// keeps its `genres: []` key.
		const obj = { data: { ...parsedBookWithoutGenres, genres: [] }, modified: false }
		mockIsEqualData.mockReturnValue(true)
		mockFindOne.mockResolvedValue(stored as unknown as BookDocument)
		helper.setData(incoming)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
		expect(mockIsEqualData).toHaveBeenCalledTimes(1)
		expect(mockIsEqualData).toHaveBeenCalledWith(
			parsedBookWithoutGenres,
			{ ...parsedBookWithoutGenres }
		)
		expect(mockUpdateOne).not.toHaveBeenCalled()
	})
	test('createOrUpdate updates when neither side has genres', async () => {
		// Genre-less legacy rows must still accept other fields (ratings):
		// with no stored genres there is nothing the update could nuke.
		const obj = { data: parsedBookWithoutGenres, modified: true }
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(parsedBookWithoutGenres as unknown as BookDocument)
			.mockResolvedValueOnce(bookWithoutGenresWithoutProjection)
			.mockResolvedValue(parsedBookWithoutGenres as unknown as BookDocument)
		helper.setData(parsedBookWithoutGenres)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
		expect(mockUpdateOne).toHaveBeenCalledTimes(1)
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
				$unset: { ratingsBackfillSkip: '' },
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
