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
	test('createOrUpdate empty incoming genres keep stored row', async () => {
		// No genre gate: the effective write retains stored genres, so the
		// projection is unchanged and no update is performed.
		const obj = { data: parsedBook, modified: false }
		mockIsEqualData.mockReturnValue(true)
		mockFindOne
			.mockResolvedValueOnce(parsedBook as unknown as BookDocument)
			.mockResolvedValueOnce(bookWithoutProjection)
			.mockResolvedValue(parsedBook as unknown as BookDocument)
		helper.setData(parsedBookWithoutGenres)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate identical book without genres', async () => {
		// No genre gate: identical projections short-circuit to no update.
		const obj = { data: parsedBookWithoutGenres, modified: false }
		mockIsEqualData.mockReturnValue(true)
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
	test('createOrUpdate tags-only change persists the effective write', async () => {
		// A tags-only change is a real update even when genres are unchanged:
		// the effective write $sets the new tags and every other stored value.
		const stored = parsedBook as unknown as Record<string, unknown>
		const newTags = [{ tagId: 't1', name: 'Witty', type: 'mood' as const }]
		const incoming = { ...parsedBook, tags: newTags }
		const expectedSet = {
			...stored,
			tags: newTags,
			createdAt: bookWithoutProjection._id.getTimestamp()
		}
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(stored as unknown as BookDocument)
			.mockResolvedValueOnce(bookWithoutProjection)
			.mockResolvedValue(stored as unknown as BookDocument)
		helper.setData(incoming as typeof parsedBook)
		const result = await helper.createOrUpdate()
		expect(result.modified).toBe(true)
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin, $or: [{ region: { $exists: false } }, { region: options.region }] },
			{ $set: expectedSet, $currentDate: { updatedAt: true } }
		)
	})
	test('createOrUpdate empty incoming genres keep stored genres in the write', async () => {
		// Genres retention: an empty incoming genres array never nukes the
		// stored genres; a title change still triggers the effective write.
		const stored = parsedBook as unknown as Record<string, unknown>
		const incoming = { ...parsedBook, title: 'New Title', genres: [] }
		const expectedSet = {
			...stored,
			title: 'New Title',
			createdAt: bookWithoutProjection._id.getTimestamp()
		}
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(stored as unknown as BookDocument)
			.mockResolvedValueOnce(bookWithoutProjection)
			.mockResolvedValue(stored as unknown as BookDocument)
		helper.setData(incoming as typeof parsedBook)
		const result = await helper.createOrUpdate()
		expect(result.modified).toBe(true)
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin, $or: [{ region: { $exists: false } }, { region: options.region }] },
			{ $set: expectedSet, $currentDate: { updatedAt: true } }
		)
	})

	test('update keeps a concurrent refresh: stale T0 snapshot does not restore', async () => {
		// Interleaving: createOrUpdate reads T0 (no tags), a concurrent
		// refresh commits T1 (adds tags) before update() runs. The write
		// must be built against the fresh T1 read, so T1's tags survive
		// and only the incoming title changes.
		const newTags = [{ tagId: 't2', name: 'Feel-Good', type: 'mood' as const }]
		const t1 = {
			...parsedBook,
			title: 'Changed Title',
			tags: newTags
		} as unknown as Record<string, unknown>
		const incoming = { ...parsedBook, title: 'Changed Title' }
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(parsedBook as unknown as BookDocument) // T0 read
			.mockResolvedValueOnce({ ...bookWithoutProjection, tags: newTags }) // T1 read
			.mockResolvedValue(t1 as unknown as BookDocument) // post-update read
		helper.setData(incoming as typeof parsedBook)
		const result = await helper.createOrUpdate()
		expect(result.modified).toBe(true)
		expect(result.data?.tags).toEqual(newTags)
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin, $or: [{ region: { $exists: false } }, { region: options.region }] },
			{
				$set: {
					...t1,
					createdAt: bookWithoutProjection._id.getTimestamp()
				},
				$currentDate: { updatedAt: true }
			}
		)
	})
	test('createOrUpdate with stored empty genres is a no-op update', async () => {
		// A stored `genres: []` is a real key the database retains, so the
		// effective write must keep it: the write equals the stored row and
		// createOrUpdate short-circuits. If the projection dropped the key,
		// the deep comparison below fails and an update is issued.
		const sortedJson = (value: unknown): string =>
			JSON.stringify(value, Object.keys(value as object).sort())
		const stored = {
			...parsedBook,
			genres: []
		} as unknown as Record<string, unknown>
		const incoming = { ...parsedBook, genres: [] }
		mockIsEqualData.mockImplementation((a: unknown, b: unknown) => sortedJson(a) === sortedJson(b))
		mockFindOne.mockResolvedValue(stored as unknown as BookDocument)
		helper.setData(incoming as typeof parsedBook)
		const result = await helper.createOrUpdate()
		expect(result.modified).toBe(false)
		expect(mockUpdateOne).not.toHaveBeenCalled()
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
