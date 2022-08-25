jest.mock('#config/models/Chapter')
jest.mock('#helpers/database/papr/audible/PaprAudibleChapterHelper')
jest.mock('#helpers/database/redis/RedisHelper')

import { ChapterDocument } from '#config/models/Chapter'
import ChapterShowHelper from '#helpers/routes/ChapterShowHelper'
import {
	chaptersWithId,
	chaptersWithoutProjection,
	chaptersWithoutProjectionUpdatedNow,
	parsedChapters
} from '#tests/datasets/helpers/chapters'

let asin: string
let helper: ChapterShowHelper

beforeEach(() => {
	asin = 'B079LRSMNN'
	helper = new ChapterShowHelper(asin, { update: undefined }, null)
	jest
		.spyOn(helper.paprHelper, 'createOrUpdate')
		.mockResolvedValue({ data: chaptersWithoutProjection, modified: true })
	jest
		.spyOn(helper.paprHelper, 'findOne')
		.mockResolvedValue({ data: chaptersWithoutProjection, modified: false })
	jest.spyOn(helper.chapterHelper, 'process').mockResolvedValue(parsedChapters)
	jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(chaptersWithoutProjection)
	jest
		.spyOn(helper.paprHelper, 'findOneWithProjection')
		.mockResolvedValue({ data: chaptersWithoutProjection, modified: false })
})

describe('ChapterShowHelper should', () => {
	test('get a chapter from Papr', async () => {
		await expect(helper.getChaptersFromPapr()).resolves.toBe(chaptersWithoutProjection)
	})

	test('get new chapter data', async () => {
		await expect(helper.getNewChapterData()).resolves.toBe(parsedChapters)
	})

	test('create or update a chapter', async () => {
		await expect(helper.createOrUpdateChapters()).resolves.toStrictEqual({
			data: chaptersWithoutProjection,
			modified: true
		})
	})

	test('create or update chapter and return undefined if no chapters', async () => {
		jest.spyOn(helper.chapterHelper, 'process').mockResolvedValue(undefined)
		await expect(helper.createOrUpdateChapters()).resolves.toBeUndefined()
	})

	test('update chapter with timestamps returns original chapter', async () => {
		helper.originalChapter = chaptersWithoutProjection
		await expect(helper.updateChapterTimestamps()).resolves.toBe(chaptersWithoutProjection)
	})

	test('update chapter without timestamps returns updated chapter', async () => {
		helper.originalChapter = chaptersWithId() as ChapterDocument
		jest
			.spyOn(helper.paprHelper, 'update')
			.mockResolvedValue({ data: chaptersWithoutProjection, modified: true })
		await expect(helper.updateChapterTimestamps()).resolves.toBe(chaptersWithoutProjection)
	})

	test('returns original chapter if it was updated recently when trying to update', async () => {
		helper.originalChapter = chaptersWithoutProjectionUpdatedNow
		await expect(helper.updateActions()).resolves.toBe(chaptersWithoutProjectionUpdatedNow)
	})

	test('isUpdatedRecently returns false if no originalChapter is present', () => {
		expect(helper.isUpdatedRecently()).toBe(false)
	})

	test('run all update actions', async () => {
		helper.originalChapter = chaptersWithoutProjection
		await expect(helper.updateActions()).resolves.toBe(chaptersWithoutProjection)
	})

	test('run all update actions and return undefined if no chapters', async () => {
		jest.spyOn(helper.chapterHelper, 'process').mockResolvedValue(undefined)
		helper.originalChapter = chaptersWithoutProjection
		await expect(helper.updateActions()).resolves.toBeUndefined()
	})

	test('run handler for a new chapter', async () => {
		jest.spyOn(helper.paprHelper, 'findOne').mockResolvedValue({ data: null, modified: false })
		await expect(helper.handler()).resolves.toBe(chaptersWithoutProjection)
	})

	test('run handler and update an existing chapter', async () => {
		helper = new ChapterShowHelper(asin, { update: '1' }, null)
		jest
			.spyOn(helper.paprHelper, 'createOrUpdate')
			.mockResolvedValue({ data: chaptersWithoutProjection, modified: true })
		jest
			.spyOn(helper.paprHelper, 'findOne')
			.mockResolvedValue({ data: chaptersWithoutProjection, modified: false })
		jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(chaptersWithoutProjection)
		await expect(helper.handler()).resolves.toBe(chaptersWithoutProjection)
	})

	test('run handler for an existing chapter', async () => {
		jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(undefined)
		await expect(helper.handler()).resolves.toBe(chaptersWithoutProjection)
	})

	test('run handler for an existing chapter in redis', async () => {
		await expect(helper.handler()).resolves.toBe(chaptersWithoutProjection)
	})

	test('run handler for no chapters', async () => {
		jest.spyOn(helper.paprHelper, 'findOne').mockResolvedValue({ data: null, modified: false })
		jest.spyOn(helper.chapterHelper, 'process').mockResolvedValue(undefined)
		await expect(helper.handler()).resolves.toBeUndefined()
	})
})

describe('ChapterShowHelper should throw an error when', () => {
	test('adding timestamps to a chapter fails', async () => {
		helper.originalChapter = chaptersWithId() as ChapterDocument
		jest
			.spyOn(helper.paprHelper, 'update')
			.mockRejectedValue(
				new Error(`An error occurred while adding timestamps to chapter ${asin} in the DB`)
			)
		await expect(helper.updateChapterTimestamps()).rejects.toThrowError(
			`An error occurred while adding timestamps to chapter ${asin} in the DB`
		)
	})
})
