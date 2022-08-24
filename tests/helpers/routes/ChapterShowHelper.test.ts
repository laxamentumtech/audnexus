jest.mock('#config/models/Chapter')
jest.mock('#helpers/database/audible/PaprAudibleChapterHelper')
jest.mock('#helpers/books/audible/StitchHelper')
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
	test('get a book from Papr', async () => {
		await expect(helper.getChaptersFromPapr()).resolves.toBe(chaptersWithoutProjection)
	})

	test('get new book data', async () => {
		await expect(helper.getNewChapterData()).resolves.toBe(parsedChapters)
	})

	test('create or update a book', async () => {
		await expect(helper.createOrUpdateChapters()).resolves.toStrictEqual({
			data: chaptersWithoutProjection,
			modified: true
		})
	})

	test('update book with timestamps returns original book', async () => {
		helper.originalChapter = chaptersWithoutProjection
		await expect(helper.updateChapterTimestamps()).resolves.toBe(chaptersWithoutProjection)
	})

	test('update book without timestamps returns updated book', async () => {
		helper.originalChapter = chaptersWithId as ChapterDocument
		jest
			.spyOn(helper.paprHelper, 'update')
			.mockResolvedValue({ data: chaptersWithoutProjection, modified: true })
		await expect(helper.updateChapterTimestamps()).resolves.toBe(chaptersWithoutProjection)
	})

	test('returns original book if it was updated recently when trying to update', async () => {
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

	test('run handler for a new book', async () => {
		jest.spyOn(helper.paprHelper, 'findOne').mockResolvedValue({ data: null, modified: false })
		await expect(helper.handler()).resolves.toBe(chaptersWithoutProjection)
	})

	test('run handler and update an existing book', async () => {
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

	test('run handler for an existing book', async () => {
		jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(undefined)
		await expect(helper.handler()).resolves.toBe(chaptersWithoutProjection)
	})

	test('run handler for an existing book in redis', async () => {
		await expect(helper.handler()).resolves.toBe(chaptersWithoutProjection)
	})
})
