jest.mock('#config/models/Chapter')
jest.mock('#helpers/database/papr/audible/PaprAudibleChapterHelper')
jest.mock('#helpers/database/redis/RedisHelper')
jest.mock('#helpers/utils/shared')
jest.mock('#config/typing/checkers')

import { ApiChapter } from '#config/types'
import ChapterShowHelper from '#helpers/routes/ChapterShowHelper'
import {
	chaptersWithoutProjection,
	chaptersWithoutProjectionUpdatedNow,
	parsedChapters
} from '#tests/datasets/helpers/chapters'

let asin: string
let helper: ChapterShowHelper

beforeEach(() => {
	asin = 'B079LRSMNN'
	helper = new ChapterShowHelper(asin, { region: 'us', update: undefined }, null)
	jest
		.spyOn(helper.paprHelper, 'createOrUpdate')
		.mockResolvedValue({ data: parsedChapters, modified: true })
	jest
		.spyOn(helper.paprHelper, 'findOne')
		.mockResolvedValue({ data: chaptersWithoutProjection, modified: false })
	jest.spyOn(helper.chapterHelper, 'process').mockResolvedValue(parsedChapters)
	jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(parsedChapters)
	jest
		.spyOn(helper.paprHelper, 'findOneWithProjection')
		.mockResolvedValue({ data: parsedChapters, modified: false })
	jest.spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(parsedChapters)
	jest.spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(false)
})

describe('ChapterShowHelper should', () => {
	test('get a chapter from Papr', async () => {
		await expect(helper.getChaptersFromPapr()).resolves.toStrictEqual(chaptersWithoutProjection)
	})

	test('get new chapter data', async () => {
		await expect(helper.getNewChapterData()).resolves.toStrictEqual(parsedChapters)
	})

	test('create or update a chapter', async () => {
		await expect(helper.createOrUpdateChapters()).resolves.toStrictEqual(parsedChapters)
	})

	test('create or update chapter and return undefined if no chapters', async () => {
		jest.spyOn(helper.chapterHelper, 'process').mockResolvedValue(undefined)
		await expect(helper.createOrUpdateChapters()).resolves.toBeUndefined()
	})

	test('returns original chapter if it was updated recently when trying to update', async () => {
		jest.spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(true)
		helper.originalChapter = chaptersWithoutProjectionUpdatedNow
		await expect(helper.updateActions()).resolves.toStrictEqual(parsedChapters)
	})

	test('isUpdatedRecently returns false if no originalChapter is present', () => {
		expect(helper.isUpdatedRecently()).toBe(false)
	})

	test('run all update actions', async () => {
		helper.originalChapter = chaptersWithoutProjection
		await expect(helper.updateActions()).resolves.toStrictEqual(parsedChapters)
	})

	test('run all update actions and return undefined if no chapters', async () => {
		jest.spyOn(helper.chapterHelper, 'process').mockResolvedValue(undefined)
		helper.originalChapter = chaptersWithoutProjection
		await expect(helper.updateActions()).resolves.toBeUndefined()
	})

	test('run handler for a new chapter', async () => {
		jest.spyOn(helper.paprHelper, 'findOne').mockResolvedValue({ data: null, modified: false })
		await expect(helper.handler()).resolves.toStrictEqual(parsedChapters)
	})

	test('run handler and update an existing chapter', async () => {
		helper = new ChapterShowHelper(asin, { region: 'us', update: '1' }, null)
		// Need to re-do mock since helper reset
		jest
			.spyOn(helper.paprHelper, 'createOrUpdate')
			.mockResolvedValue({ data: parsedChapters, modified: true })
		jest
			.spyOn(helper.paprHelper, 'findOne')
			.mockResolvedValue({ data: chaptersWithoutProjection, modified: false })
		jest
			.spyOn(helper.paprHelper, 'findOneWithProjection')
			.mockResolvedValue({ data: parsedChapters, modified: false })
		jest.spyOn(helper.chapterHelper, 'process').mockResolvedValue(parsedChapters)
		jest.spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(parsedChapters)
		jest.spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(false)
		await expect(helper.handler()).resolves.toStrictEqual(parsedChapters)
	})

	test('run handler for an existing chapter', async () => {
		jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(undefined)
		await expect(helper.handler()).resolves.toStrictEqual(parsedChapters)
	})

	test('run handler for an existing chapter in redis', async () => {
		await expect(helper.handler()).resolves.toStrictEqual(parsedChapters)
	})

	test('run handler for no chapters', async () => {
		jest.spyOn(helper.paprHelper, 'findOne').mockResolvedValue({ data: null, modified: false })
		jest.spyOn(helper.chapterHelper, 'process').mockResolvedValue(undefined)
		await expect(helper.handler()).resolves.toBeUndefined()
	})
})

describe('ChapterShowHelper should throw error when', () => {
	test('getChaptersWithProjection is not a chapter type', async () => {
		jest
			.spyOn(helper.paprHelper, 'findOneWithProjection')
			.mockResolvedValue({ data: null, modified: false })
		await expect(helper.getChapterWithProjection()).rejects.toThrow(
			`Data type for ${asin} is not Chapter`
		)
	})
	test('getChaptersWithProjection sorted chapters is not a chapter type', async () => {
		jest
			.spyOn(helper.sharedHelper, 'sortObjectByKeys')
			.mockReturnValue(null as unknown as ApiChapter)
		await expect(helper.getChapterWithProjection()).rejects.toThrow(
			`Data type for ${asin} is not Chapter`
		)
	})
	test('createOrUpdateChapters is not a chapter type', async () => {
		jest
			.spyOn(helper.paprHelper, 'createOrUpdate')
			.mockResolvedValue({ data: null, modified: false })
		await expect(helper.createOrUpdateChapters()).rejects.toThrow(
			`Data type for ${asin} is not Chapter`
		)
	})
	test('update has no originalChapter', async () => {
		helper.originalChapter = null
		await expect(helper.updateActions()).rejects.toThrow(
			`Missing original Chapter data for ASIN: ${asin}`
		)
	})
})
