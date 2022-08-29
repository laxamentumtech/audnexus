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
		.mockResolvedValue({ data: parsedAuthor, modified: true })
	jest
		.spyOn(helper.paprHelper, 'findOne')
		.mockResolvedValue({ data: authorWithoutProjection, modified: false })
	jest.spyOn(helper.scrapeHelper, 'process').mockResolvedValue(parsedAuthor)
	jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(parsedAuthor)
	jest
		.spyOn(helper.paprHelper, 'findOneWithProjection')
		.mockResolvedValue({ data: parsedAuthor, modified: false })
})

describe('AuthorShowHelper should', () => {
	test('get a author from Papr', async () => {
		await expect(helper.getAuthorFromPapr()).resolves.toStrictEqual(authorWithoutProjection)
	})

	test('get new author data', async () => {
		await expect(helper.getNewAuthorData()).resolves.toStrictEqual(parsedAuthor)
	})

	test('create or update a author', async () => {
		await expect(helper.createOrUpdateAuthor()).resolves.toStrictEqual(parsedAuthor)
	})

	// test('returns original author if it was updated recently when trying to update', async () => {
	// 	jest
	// 		.spyOn(helper.paprHelper, 'findOneWithProjection')
	// 		.mockResolvedValue({ data: authorWithoutProjectionUpdatedNow, modified: false })
	// 	helper.originalAuthor = authorWithoutProjectionUpdatedNow
	// 	await expect(helper.updateActions()).resolves.toBe(authorWithoutProjectionUpdatedNow)
	// })

	test('isUpdatedRecently returns false if no originalAuthor is present', () => {
		expect(helper.isUpdatedRecently()).toBe(false)
	})

	test('run all update actions', async () => {
		helper.originalAuthor = authorWithoutProjection
		await expect(helper.updateActions()).resolves.toStrictEqual(parsedAuthor)
	})

	test('run handler for a new author', async () => {
		jest.spyOn(helper.paprHelper, 'findOne').mockResolvedValue({ data: null, modified: false })
		await expect(helper.handler()).resolves.toStrictEqual(parsedAuthor)
	})

	test('run handler and update an existing author', async () => {
		helper = new AuthorShowHelper(asin, { update: '1' }, null)
		// Need to re-do mock since helper reset
		jest
			.spyOn(helper.paprHelper, 'createOrUpdate')
			.mockResolvedValue({ data: parsedAuthor, modified: true })
		jest
			.spyOn(helper.paprHelper, 'findOne')
			.mockResolvedValue({ data: authorWithoutProjection, modified: false })
		jest
			.spyOn(helper.paprHelper, 'findOneWithProjection')
			.mockResolvedValue({ data: parsedAuthor, modified: false })
		await expect(helper.handler()).resolves.toStrictEqual(parsedAuthor)
	})

	test('run handler for an existing author', async () => {
		jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(undefined)
		await expect(helper.handler()).resolves.toStrictEqual(parsedAuthor)
	})

	test('run handler for an existing author in redis', async () => {
		await expect(helper.handler()).resolves.toStrictEqual(parsedAuthor)
	})
})
