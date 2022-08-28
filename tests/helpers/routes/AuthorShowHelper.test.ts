jest.mock('#config/models/Author')
jest.mock('#helpers/database/papr/audible/PaprAudibleAuthorHelper')
jest.mock('#helpers/authors/audible/ScrapeHelper')
jest.mock('#helpers/database/redis/RedisHelper')

import AuthorShowHelper from '#helpers/routes/AuthorShowHelper'
import {
	authorWithoutProjection,
	authorWithoutProjectionUpdatedNow,
	parsedAuthor
} from '#tests/datasets/helpers/authors'

let asin: string
let helper: AuthorShowHelper

beforeEach(() => {
	asin = 'B079LRSMNN'
	helper = new AuthorShowHelper(asin, { update: undefined }, null)
	jest
		.spyOn(helper.paprHelper, 'createOrUpdate')
		.mockResolvedValue({ data: authorWithoutProjection, modified: true })
	jest
		.spyOn(helper.paprHelper, 'findOne')
		.mockResolvedValue({ data: authorWithoutProjection, modified: false })
	jest.spyOn(helper.scrapeHelper, 'process').mockResolvedValue(parsedAuthor)
	jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(authorWithoutProjection)
	jest
		.spyOn(helper.paprHelper, 'findOneWithProjection')
		.mockResolvedValue({ data: authorWithoutProjection, modified: false })
})

describe('AuthorShowHelper should', () => {
	test('get a author from Papr', async () => {
		await expect(helper.getAuthorFromPapr()).resolves.toBe(authorWithoutProjection)
	})

	test('get new author data', async () => {
		await expect(helper.getNewAuthorData()).resolves.toBe(parsedAuthor)
	})

	test('create or update a author', async () => {
		await expect(helper.createOrUpdateAuthor()).resolves.toStrictEqual(authorWithoutProjection)
	})

	test('returns original author if it was updated recently when trying to update', async () => {
		jest
			.spyOn(helper.paprHelper, 'findOneWithProjection')
			.mockResolvedValue({ data: authorWithoutProjectionUpdatedNow, modified: false })
		helper.originalAuthor = authorWithoutProjectionUpdatedNow
		await expect(helper.updateActions()).resolves.toBe(authorWithoutProjectionUpdatedNow)
	})

	test('isUpdatedRecently returns false if no originalAuthor is present', () => {
		expect(helper.isUpdatedRecently()).toBe(false)
	})

	test('run all update actions', async () => {
		helper.originalAuthor = authorWithoutProjection
		await expect(helper.updateActions()).resolves.toBe(authorWithoutProjection)
	})

	test('run handler for a new author', async () => {
		jest.spyOn(helper.paprHelper, 'findOne').mockResolvedValue({ data: null, modified: false })
		await expect(helper.handler()).resolves.toBe(authorWithoutProjection)
	})

	test('run handler and update an existing author', async () => {
		helper = new AuthorShowHelper(asin, { update: '1' }, null)
		jest
			.spyOn(helper.paprHelper, 'createOrUpdate')
			.mockResolvedValue({ data: authorWithoutProjection, modified: true })
		jest
			.spyOn(helper.paprHelper, 'findOne')
			.mockResolvedValue({ data: authorWithoutProjection, modified: false })
		jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(authorWithoutProjection)
		await expect(helper.handler()).resolves.toBe(authorWithoutProjection)
	})

	test('run handler for an existing author', async () => {
		jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(undefined)
		await expect(helper.handler()).resolves.toBe(authorWithoutProjection)
	})

	test('run handler for an existing author in redis', async () => {
		await expect(helper.handler()).resolves.toBe(authorWithoutProjection)
	})
})
