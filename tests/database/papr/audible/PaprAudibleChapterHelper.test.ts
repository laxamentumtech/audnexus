jest.mock('#config/models/Chapter')
jest.mock('#helpers/utils/shared')

import { FastifyBaseLogger } from 'fastify'
import { mock } from 'jest-mock-extended'

import ChapterModel, { ChapterDocument } from '#config/models/Chapter'
import { ApiQueryString } from '#config/types'
import * as checkers from '#config/typing/checkers'
import PaprAudibleChapterHelper from '#helpers/database/papr/audible/PaprAudibleChapterHelper'
import SharedHelper from '#helpers/utils/shared'
import { chaptersWithoutProjection, parsedChapters } from '#tests/datasets/helpers/chapters'

let asin: string
let helper: PaprAudibleChapterHelper
let options: ApiQueryString

beforeEach(() => {
	asin = parsedChapters.asin
	options = {
		region: 'us',
		seedAuthors: undefined,
		update: '1'
	}
	helper = new PaprAudibleChapterHelper(asin, options)

	jest.spyOn(ChapterModel, 'updateOne').mockResolvedValue({
		acknowledged: true,
		matchedCount: 1,
		modifiedCount: 1,
		upsertedCount: 0,
		upsertedId: chaptersWithoutProjection._id
	})
	jest.spyOn(ChapterModel, 'findOne').mockResolvedValue(chaptersWithoutProjection)
	jest.spyOn(ChapterModel, 'insertOne').mockResolvedValue(chaptersWithoutProjection)
	jest.spyOn(checkers, 'isChapterDocument').mockReturnValue(true)
})

describe('PaprAudibleChapterHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.options).toBe(options)
	})
	test('create', async () => {
		const obj = { data: parsedChapters, modified: true }
		jest
			.spyOn(ChapterModel, 'findOne')
			.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		helper.setData(parsedChapters)

		await expect(helper.create()).resolves.toEqual(obj)
		expect(ChapterModel.insertOne).toHaveBeenCalledWith(parsedChapters)
		expect(ChapterModel.findOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('delete', async () => {
		const obj = { data: { acknowledged: true, deletedCount: 1 }, modified: true }
		jest.spyOn(ChapterModel, 'deleteOne').mockResolvedValue(obj.data)
		await expect(helper.delete()).resolves.toEqual(obj)
		expect(ChapterModel.deleteOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOne', async () => {
		const obj = { data: chaptersWithoutProjection, modified: false }
		await expect(helper.findOne()).resolves.toEqual(obj)
		expect(ChapterModel.findOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOne returns null if it is not a ChapterDocument', async () => {
		const obj = { data: null, modified: false }
		jest.spyOn(ChapterModel, 'findOne').mockResolvedValueOnce(null)
		jest.spyOn(checkers, 'isChapterDocument').mockReturnValueOnce(false)
		await expect(helper.findOne()).resolves.toEqual(obj)
		expect(ChapterModel.findOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOneWithProjection', async () => {
		const obj = { data: parsedChapters, modified: false }
		jest
			.spyOn(ChapterModel, 'findOne')
			.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		await expect(helper.findOneWithProjection()).resolves.toEqual(obj)
		expect(ChapterModel.findOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOneWithProjection returns null if it is not a ApiChapter', async () => {
		const obj = { data: null, modified: false }
		jest.spyOn(ChapterModel, 'findOne').mockResolvedValueOnce(null)
		await expect(helper.findOneWithProjection()).resolves.toEqual(obj)
		expect(ChapterModel.findOne).toHaveBeenCalledWith({
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
		jest
			.spyOn(ChapterModel, 'findOne')
			.mockResolvedValueOnce(parsedChapters as unknown as ChapterDocument)
		jest.spyOn(ChapterModel, 'findOne').mockResolvedValueOnce(chaptersWithoutProjection)
		jest
			.spyOn(ChapterModel, 'findOne')
			.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		helper.setData(parsedChapters)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate finds no one to update', async () => {
		const obj = { data: parsedChapters, modified: false }
		jest
			.spyOn(ChapterModel, 'findOne')
			.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		const test = { ...parsedChapters }
		test.chapters = []
		helper.setData(test)
		jest.spyOn(SharedHelper.prototype, 'isEqualData').mockReturnValue(false)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate finds identical update data', async () => {
		const obj = { data: parsedChapters, modified: false }
		jest
			.spyOn(ChapterModel, 'findOne')
			.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		jest.spyOn(SharedHelper.prototype, 'isEqualData').mockReturnValue(true)
		helper.setData(parsedChapters)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate needs to create', async () => {
		const obj = { data: parsedChapters, modified: true }
		jest.spyOn(ChapterModel, 'findOne').mockResolvedValueOnce(null)
		jest.spyOn(ChapterModel, 'findOne').mockResolvedValue(chaptersWithoutProjection)
		helper.setData(parsedChapters)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate logs info when updating', async () => {
		const mockLogger = mock<FastifyBaseLogger>()
		const helperWithLogger = new PaprAudibleChapterHelper(asin, options, mockLogger)
		jest
			.spyOn(ChapterModel, 'findOne')
			.mockResolvedValueOnce(parsedChapters as unknown as ChapterDocument)
		jest.spyOn(ChapterModel, 'findOne').mockResolvedValueOnce(chaptersWithoutProjection)
		jest
			.spyOn(ChapterModel, 'findOne')
			.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		jest.spyOn(SharedHelper.prototype, 'isEqualData').mockReturnValue(false)
		helperWithLogger.setData(parsedChapters)
		await helperWithLogger.createOrUpdate()
		expect(mockLogger.info).toHaveBeenCalledWith(
			expect.stringContaining(`Updating chapters ASIN ${asin}`)
		)
	})
	test('update', async () => {
		const obj = { data: parsedChapters, modified: true }
		jest.spyOn(ChapterModel, 'findOne').mockResolvedValueOnce(chaptersWithoutProjection)
		jest
			.spyOn(ChapterModel, 'findOne')
			.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		helper.setData(parsedChapters)
		await expect(helper.update()).resolves.toEqual(obj)
		expect(ChapterModel.updateOne).toHaveBeenCalledWith(
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
		jest.spyOn(ChapterModel, 'insertOne').mockRejectedValue(new Error('error'))
		helper.setData(parsedChapters)
		await expect(helper.create()).rejects.toThrow(
			`An error occurred while creating chapter ${asin} in the DB`
		)
	})
	test('create logs error on failure', async () => {
		const mockLogger = mock<FastifyBaseLogger>()
		const helperWithLogger = new PaprAudibleChapterHelper(asin, options, mockLogger)
		jest.spyOn(ChapterModel, 'insertOne').mockRejectedValue(new Error('DB error'))
		helperWithLogger.setData(parsedChapters)
		await expect(helperWithLogger.create()).rejects.toThrow()
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})
	test('delete', async () => {
		jest.spyOn(ChapterModel, 'deleteOne').mockRejectedValue(new Error('error'))
		await expect(helper.delete()).rejects.toThrow(
			`An error occurred while deleting chapter ${asin} in the DB`
		)
	})
	test('delete logs error on failure', async () => {
		const mockLogger = mock<FastifyBaseLogger>()
		const helperWithLogger = new PaprAudibleChapterHelper(asin, options, mockLogger)
		jest.spyOn(ChapterModel, 'deleteOne').mockRejectedValue(new Error('DB error'))
		await expect(helperWithLogger.delete()).rejects.toThrow()
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})
	test('update did not find existing', async () => {
		jest.spyOn(ChapterModel, 'findOne').mockResolvedValueOnce(null)
		helper.setData(parsedChapters)
		await expect(helper.update()).rejects.toThrow(
			`An error occurred while updating chapter ${asin} in the DB`
		)
	})
	test('update did not find existing logs error', async () => {
		const mockLogger = mock<FastifyBaseLogger>()
		const helperWithLogger = new PaprAudibleChapterHelper(asin, options, mockLogger)
		jest.spyOn(ChapterModel, 'findOne').mockResolvedValueOnce(null)
		helperWithLogger.setData(parsedChapters)
		await expect(helperWithLogger.update()).rejects.toThrow()
		expect(mockLogger.error).toHaveBeenCalledWith(`Chapter ${asin} not found in the DB for update`)
	})
	test('update', async () => {
		jest.spyOn(ChapterModel, 'updateOne').mockRejectedValue(new Error('error'))
		helper.setData(parsedChapters)
		await expect(helper.update()).rejects.toThrow(
			`An error occurred while updating chapter ${asin} in the DB`
		)
	})
	test('update logs error on failure', async () => {
		const mockLogger = mock<FastifyBaseLogger>()
		const helperWithLogger = new PaprAudibleChapterHelper(asin, options, mockLogger)
		jest.spyOn(ChapterModel, 'findOne').mockResolvedValueOnce(chaptersWithoutProjection)
		jest.spyOn(ChapterModel, 'updateOne').mockRejectedValue(new Error('DB error'))
		helperWithLogger.setData(parsedChapters)
		await expect(helperWithLogger.update()).rejects.toThrow()
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})
})
