jest.mock('@fastify/redis')
jest.mock('#config/models/Author')
jest.mock('#config/models/Book')
jest.mock('#config/models/Chapter')
jest.mock('#helpers/routes/AuthorShowHelper')
jest.mock('#helpers/routes/BookShowHelper')
jest.mock('#helpers/routes/ChapterShowHelper')
import type { FastifyRedis } from '@fastify/redis'
import { DeepMockProxy, mockDeep } from 'jest-mock-extended'
import { AsyncTask, LongIntervalJob } from 'toad-scheduler'

import AuthorModel from '#config/models/Author'
import BookModel from '#config/models/Book'
import ChapterModel from '#config/models/Chapter'
import AuthorShowHelper from '#helpers/routes/AuthorShowHelper'
import BookShowHelper from '#helpers/routes/BookShowHelper'
import ChapterShowHelper from '#helpers/routes/ChapterShowHelper'
import UpdateScheduler from '#helpers/utils/UpdateScheduler'

type MockContext = {
	client: DeepMockProxy<FastifyRedis>
}

let ctx: MockContext
let helper: UpdateScheduler
const projection = {
	projection: { asin: 1, region: 1 },
	sort: { updatedAt: -1 },
	allowDiskUse: true
}

const createMockContext = (): MockContext => {
	return {
		client: mockDeep<FastifyRedis>()
	}
}

beforeEach(() => {
	ctx = createMockContext()
	helper = new UpdateScheduler(1, ctx.client)
})

describe('UpdateScheduler should', () => {
	test('setup constructor', () => {
		expect(helper).toBeInstanceOf(UpdateScheduler)
		expect(helper.redis).toBe(ctx.client)
		expect(helper.interval).toBe(1)
	})

	test('getAllAuthorAsins', async () => {
		jest.spyOn(AuthorModel, 'find').mockResolvedValue([{ asin: 'B079LRSMNN', region: 'us' }] as any)
		await expect(helper.getAllAuthorAsins()).resolves.toEqual([
			{ asin: 'B079LRSMNN', region: 'us' }
		])
		expect(AuthorModel.find).toHaveBeenCalledWith({}, projection)
	})

	test('getAllBookAsins', async () => {
		jest.spyOn(BookModel, 'find').mockResolvedValue([{ asin: 'B079LRSMNN', region: 'us' }] as any)
		await expect(helper.getAllBookAsins()).resolves.toEqual([{ asin: 'B079LRSMNN', region: 'us' }])
		expect(BookModel.find).toHaveBeenCalledWith({}, projection)
	})

	test('getAllChapterAsins', async () => {
		jest
			.spyOn(ChapterModel, 'find')
			.mockResolvedValue([{ asin: 'B079LRSMNN', region: 'us' }] as any)
		await expect(helper.getAllChapterAsins()).resolves.toEqual([
			{ asin: 'B079LRSMNN', region: 'us' }
		])
		expect(ChapterModel.find).toHaveBeenCalledWith({}, projection)
	})

	test('updateAuthors', async () => {
		jest.spyOn(AuthorModel, 'find').mockResolvedValue([{ asin: 'B079LRSMNN', region: 'us' }] as any)
		jest.spyOn(AuthorShowHelper.prototype, 'handler').mockResolvedValue({} as any)
		await expect(helper.updateAuthors()).resolves.toEqual(undefined)
		expect(AuthorModel.find).toHaveBeenCalledWith({}, projection)
		expect(AuthorShowHelper.prototype.handler).toHaveBeenCalledWith()
	})

	test('updateBooks', async () => {
		jest.spyOn(BookModel, 'find').mockResolvedValue([{ asin: 'B079LRSMNN', region: 'us' }] as any)
		jest.spyOn(BookShowHelper.prototype, 'handler').mockResolvedValue({} as any)
		await expect(helper.updateBooks()).resolves.toEqual(undefined)
		expect(BookModel.find).toHaveBeenCalledWith({}, projection)
		expect(BookShowHelper.prototype.handler).toHaveBeenCalledWith()
	})

	test('updateChapters', async () => {
		jest
			.spyOn(ChapterModel, 'find')
			.mockResolvedValue([{ asin: 'B079LRSMNN', region: 'us' }] as any)
		jest.spyOn(ChapterShowHelper.prototype, 'handler').mockResolvedValue({} as any)
		await expect(helper.updateChapters()).resolves.toEqual(undefined)
		expect(ChapterModel.find).toHaveBeenCalledWith({}, projection)
		expect(ChapterShowHelper.prototype.handler).toHaveBeenCalledWith()
	})

	test('updateAll', async () => {
		jest.spyOn(helper, 'updateAuthors').mockResolvedValue(undefined)
		jest.spyOn(helper, 'updateBooks').mockResolvedValue(undefined)
		jest.spyOn(helper, 'updateChapters').mockResolvedValue(undefined)
		await expect(helper.updateAll()).resolves.toEqual(undefined)
		expect(helper.updateAuthors).toHaveBeenCalledWith()
		expect(helper.updateBooks).toHaveBeenCalledWith()
		expect(helper.updateChapters).toHaveBeenCalledWith()
	})

	test('updateAllTask', async () => {
		jest.spyOn(helper, 'updateAll').mockResolvedValue(undefined)
		expect(JSON.stringify(helper.updateAllTask())).toEqual(
			JSON.stringify(
				new AsyncTask(
					'updateAll',
					() => {
						return helper.updateAll().then((res) => res)
					},
					(err) => {
						console.error(err)
					}
				)
			)
		)
	})

	test('updateAllJob', async () => {
		jest.spyOn(helper, 'updateAllTask').mockReturnValue({} as any)
		expect(JSON.stringify(helper.updateAllJob())).toEqual(
			JSON.stringify(
				new LongIntervalJob({ days: 1, runImmediately: true }, helper.updateAllTask(), {
					id: 'id_1',
					preventOverrun: true
				})
			)
		)
	})
})
