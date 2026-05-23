import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'

import { createMockLogger } from '#tests/setup/mockLogger'

const mockUpdateOne = mock()
const mockFindOne = mock()
const mockInsertOne = mock()
const mockDeleteOne = mock()
const mockFind = mock()

mock.module('#config/models/Chapter', () => ({
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

import type { ChapterDocument } from '#config/models/Chapter'
import { ApiQueryString } from '#config/types'
import * as checkers from '#config/typing/checkers'
import PaprAudibleChapterHelper from '#helpers/database/papr/audible/PaprAudibleChapterHelper'
import { chaptersWithoutProjection, parsedChapters } from '#tests/datasets/helpers/chapters'


let asin: string
let helper: PaprAudibleChapterHelper
let options: ApiQueryString

beforeEach(() => {
	mockUpdateOne.mockReset()
	mockFindOne.mockReset()
	mockInsertOne.mockReset()
	mockDeleteOne.mockReset()
	mockFind.mockReset()
	mockIsEqualData.mockReset()
	asin = parsedChapters.asin
	options = {
		region: 'us',
		seedAuthors: undefined,
		update: '1'
	}
	helper = new PaprAudibleChapterHelper(asin, options)

	mockUpdateOne.mockResolvedValue({
		acknowledged: true,
		matchedCount: 1,
		modifiedCount: 1,
		upsertedCount: 0,
		upsertedId: chaptersWithoutProjection._id
	})
	mockFindOne.mockResolvedValue(chaptersWithoutProjection)
	mockInsertOne.mockResolvedValue(chaptersWithoutProjection)
	spyOn(checkers, 'isChapterDocument').mockReturnValue(true)
})

describe('PaprAudibleChapterHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.options).toBe(options)
	})
	test('create', async () => {
		const obj = { data: parsedChapters, modified: true }
		mockFindOne.mockResolvedValueOnce(parsedChapters as unknown as ChapterDocument)
		helper.setData(parsedChapters)

		await expect(helper.create()).resolves.toEqual(obj)
		expect(mockInsertOne).toHaveBeenCalledWith(parsedChapters)
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
		const obj = { data: chaptersWithoutProjection, modified: false }
		await expect(helper.findOne()).resolves.toEqual(obj)
		expect(mockFindOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOne returns null if it is not a ChapterDocument', async () => {
		const obj = { data: null, modified: false }
		mockFindOne.mockResolvedValueOnce(null)
		spyOn(checkers, 'isChapterDocument').mockReturnValueOnce(false)
		await expect(helper.findOne()).resolves.toEqual(obj)
		expect(mockFindOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOneWithProjection', async () => {
		const obj = { data: parsedChapters, modified: false }
		mockFindOne.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		await expect(helper.findOneWithProjection()).resolves.toEqual(obj)
		expect(mockFindOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOneWithProjection returns null if it is not a ApiChapter', async () => {
		const obj = { data: null, modified: false }
		mockFindOne.mockResolvedValueOnce(null)
		await expect(helper.findOneWithProjection()).resolves.toEqual(obj)
		expect(mockFindOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('setData', () => {
		const chapterData = parsedChapters
		helper.setData(chapterData)
		expect(helper.chapterData).toBe(chapterData)
	})
	test('createOrUpdate finds one to update', async () => {
		const obj = { data: parsedChapters, modified: true }
		mockFindOne
			.mockResolvedValueOnce(parsedChapters as unknown as ChapterDocument)
			.mockResolvedValueOnce(chaptersWithoutProjection)
			.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		helper.setData(parsedChapters)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate finds no one to update', async () => {
		const obj = { data: parsedChapters, modified: false }
		mockFindOne.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		const test = { ...parsedChapters }
		test.chapters = []
		helper.setData(test)
		mockIsEqualData.mockReturnValue(false)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate finds identical update data', async () => {
		const obj = { data: parsedChapters, modified: false }
		mockFindOne.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		mockIsEqualData.mockReturnValue(true)
		helper.setData(parsedChapters)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate needs to create', async () => {
		const obj = { data: parsedChapters, modified: true }
		mockFindOne.mockResolvedValueOnce(null)
		mockFindOne.mockResolvedValue(chaptersWithoutProjection)
		helper.setData(parsedChapters)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate logs info when updating', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleChapterHelper(asin, options, mockLogger as unknown as FastifyBaseLogger)
		mockFindOne
			.mockResolvedValueOnce(parsedChapters as unknown as ChapterDocument)
			.mockResolvedValueOnce(chaptersWithoutProjection)
			.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		mockIsEqualData.mockReturnValue(false)
		helperWithLogger.setData(parsedChapters)
		await helperWithLogger.createOrUpdate()
		expect(mockLogger.info).toHaveBeenCalledWith(
			expect.stringContaining(`Updating chapters ASIN ${asin}`)
		)
	})
	test('update', async () => {
		const obj = { data: parsedChapters, modified: true }
		mockFindOne.mockResolvedValueOnce(chaptersWithoutProjection)
		mockFindOne.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		helper.setData(parsedChapters)
		await expect(helper.update()).resolves.toEqual(obj)
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin: asin, $or: [{ region: { $exists: false } }, { region: options.region }] },
			{
				$set: { ...parsedChapters, createdAt: chaptersWithoutProjection._id.getTimestamp() },
				$currentDate: { updatedAt: true }
			}
		)
	})
})

describe('PaprAudibleChapterHelper should catch error when', () => {
	test('create', async () => {
		mockInsertOne.mockRejectedValue(new Error('error'))
		helper.setData(parsedChapters)
		await expect(helper.create()).rejects.toThrow(
			`An error occurred while creating chapter ${asin} in the DB`
		)
	})
	test('create logs error on failure', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleChapterHelper(asin, options, mockLogger as unknown as FastifyBaseLogger)
		mockInsertOne.mockRejectedValue(new Error('DB error'))
		helperWithLogger.setData(parsedChapters)
		await expect(helperWithLogger.create()).rejects.toThrow()
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})
	test('delete', async () => {
		mockDeleteOne.mockRejectedValue(new Error('error'))
		await expect(helper.delete()).rejects.toThrow(
			`An error occurred while deleting chapter ${asin} in the DB`
		)
	})
	test('delete logs error on failure', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleChapterHelper(asin, options, mockLogger as unknown as FastifyBaseLogger)
		mockDeleteOne.mockRejectedValue(new Error('DB error'))
		await expect(helperWithLogger.delete()).rejects.toThrow()
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})
	test('update did not find existing', async () => {
		mockFindOne.mockResolvedValueOnce(null)
		helper.setData(parsedChapters)
		await expect(helper.update()).rejects.toThrow(
			`An error occurred while updating chapter ${asin} in the DB`
		)
	})
	test('update did not find existing logs error', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleChapterHelper(asin, options, mockLogger as unknown as FastifyBaseLogger)
		mockFindOne.mockResolvedValueOnce(null)
		helperWithLogger.setData(parsedChapters)
		await expect(helperWithLogger.update()).rejects.toThrow()
		expect(mockLogger.error).toHaveBeenCalledWith(`Chapter ${asin} not found in the DB for update`)
	})
	test('update', async () => {
		mockUpdateOne.mockRejectedValue(new Error('error'))
		helper.setData(parsedChapters)
		await expect(helper.update()).rejects.toThrow(
			`An error occurred while updating chapter ${asin} in the DB`
		)
	})
	test('update logs error on failure', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleChapterHelper(asin, options, mockLogger as unknown as FastifyBaseLogger)
		mockFindOne.mockResolvedValueOnce(chaptersWithoutProjection)
		mockUpdateOne.mockRejectedValue(new Error('DB error'))
		helperWithLogger.setData(parsedChapters)
		await expect(helperWithLogger.update()).rejects.toThrow()
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})
})

afterAll(() => {
	mock.restore()
})
