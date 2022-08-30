jest.mock('#config/models/Chapter')
jest.mock('#helpers/shared')

import ChapterModel, { ChapterDocument } from '#config/models/Chapter'
import { RequestGenericWithSeed } from '#config/typing/requests'
import PaprAudibleChapterHelper from '#helpers/database/papr/audible/PaprAudibleChapterHelper'
import SharedHelper from '#helpers/shared'
import { chaptersWithoutProjection, parsedChapters } from '#tests/datasets/helpers/chapters'

let asin: string
let helper: PaprAudibleChapterHelper
let options: RequestGenericWithSeed['Querystring']

const projectionWithoutDbFields = {
	_id: 0,
	createdAt: 0,
	updatedAt: 0
}

beforeEach(() => {
	asin = parsedChapters.asin
	options = {
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
		helper.setChapterData(parsedChapters)

		await expect(helper.create()).resolves.toEqual(obj)
		expect(ChapterModel.insertOne).toHaveBeenCalledWith(parsedChapters)
		expect(ChapterModel.findOne).toHaveBeenCalledWith(
			{ asin: asin },
			{ projection: projectionWithoutDbFields }
		)
	})
	test('delete', async () => {
		const obj = { data: { acknowledged: true, deletedCount: 1 }, modified: true }
		jest.spyOn(ChapterModel, 'deleteOne').mockResolvedValue(obj.data)
		await expect(helper.delete()).resolves.toEqual(obj)
		expect(ChapterModel.deleteOne).toHaveBeenCalledWith({ asin: asin })
	})
	test('findOne', async () => {
		const obj = { data: chaptersWithoutProjection, modified: false }
		await expect(helper.findOne()).resolves.toEqual(obj)
		expect(ChapterModel.findOne).toHaveBeenCalledWith({ asin: asin })
	})
	test('findOneWithProjection', async () => {
		const obj = { data: parsedChapters, modified: false }
		jest
			.spyOn(ChapterModel, 'findOne')
			.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		await expect(helper.findOneWithProjection()).resolves.toEqual(obj)
		expect(ChapterModel.findOne).toHaveBeenCalledWith(
			{ asin: asin },
			{ projection: projectionWithoutDbFields }
		)
	})
	test('setChapterData', () => {
		const chapterData = parsedChapters
		helper.setChapterData(chapterData)
		expect(helper.chapterData).toBe(chapterData)
	})
	test('createOrUpdate finds one to update', async () => {
		const obj = { data: parsedChapters, modified: true }
		jest
			.spyOn(ChapterModel, 'findOne')
			.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		helper.setChapterData(parsedChapters)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate finds no one to update', async () => {
		const obj = { data: parsedChapters, modified: false }
		jest
			.spyOn(ChapterModel, 'findOne')
			.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		const test = { ...parsedChapters }
		test.chapters = []
		helper.setChapterData(test)
		jest.spyOn(SharedHelper.prototype, 'checkDataEquality').mockReturnValue(false)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate finds identical update data', async () => {
		const obj = { data: parsedChapters, modified: false }
		jest
			.spyOn(ChapterModel, 'findOne')
			.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		jest.spyOn(SharedHelper.prototype, 'checkDataEquality').mockReturnValue(true)
		helper.setChapterData(parsedChapters)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate needs to create', async () => {
		const obj = { data: parsedChapters, modified: true }
		jest
			.spyOn(ChapterModel, 'findOne')
			.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		jest.spyOn(ChapterModel, 'findOne').mockResolvedValueOnce(null)
		helper.setChapterData(parsedChapters)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('update', async () => {
		const obj = { data: parsedChapters, modified: true }
		jest.spyOn(ChapterModel, 'findOne').mockResolvedValueOnce(chaptersWithoutProjection)
		jest
			.spyOn(ChapterModel, 'findOne')
			.mockResolvedValue(parsedChapters as unknown as ChapterDocument)
		helper.setChapterData(parsedChapters)
		await expect(helper.update()).resolves.toEqual(obj)
		expect(ChapterModel.updateOne).toHaveBeenCalledWith(
			{ asin: asin },
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
		helper.setChapterData(parsedChapters)
		await expect(helper.create()).rejects.toThrowError(
			`An error occurred while creating chapter ${asin} in the DB`
		)
	})
	test('delete', async () => {
		jest.spyOn(ChapterModel, 'deleteOne').mockRejectedValue(new Error('error'))
		await expect(helper.delete()).rejects.toThrowError(
			`An error occurred while deleting chapter ${asin} in the DB`
		)
	})
	test('update', async () => {
		jest.spyOn(ChapterModel, 'updateOne').mockRejectedValue(new Error('error'))
		helper.setChapterData(parsedChapters)
		await expect(helper.update()).rejects.toThrowError(
			`An error occurred while updating chapter ${asin} in the DB`
		)
	})
})
