jest.mock('#config/models/Author')
jest.mock('#helpers/database/papr/audible/PaprAudibleAuthorHelper')
jest.mock('#helpers/authors/audible/ScrapeHelper')
jest.mock('#helpers/database/redis/RedisHelper')

import { ApiAuthorProfile } from '#config/types'
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
	helper = new AuthorShowHelper(asin, { region: 'us', update: undefined }, null)
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
	jest.spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(parsedAuthor)
	jest.spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(false)
})

describe('AuthorShowHelper should', () => {
	test('get a author from Papr', async () => {
		await expect(helper.getAuthorFromPapr()).resolves.toStrictEqual(authorWithoutProjection)
	})

	test('get authors by name from Papr', async () => {
		const authors = [{ asin: 'B079LRSMNN', name: 'John Doe' }]
		const obj = { data: authors, modified: false }
		helper = new AuthorShowHelper('', { name: 'John Doe', region: 'us', update: undefined }, null)
		jest.spyOn(helper.paprHelper, 'findByName').mockResolvedValue(obj)
		await expect(helper.getAuthorsByName()).resolves.toStrictEqual(authors)
	})

	test('get new author data', async () => {
		await expect(helper.getNewAuthorData()).resolves.toStrictEqual(parsedAuthor)
	})

	test('create or update a author', async () => {
		await expect(helper.createOrUpdateAuthor()).resolves.toStrictEqual(parsedAuthor)
	})

	test('returns original author if it was updated recently when trying to update', async () => {
		jest.spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(true)
		helper.originalAuthor = authorWithoutProjectionUpdatedNow
		await expect(helper.updateActions()).resolves.toStrictEqual(parsedAuthor)
	})

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
		helper = new AuthorShowHelper(asin, { region: 'us', update: '1' }, null)
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
		jest.spyOn(helper.scrapeHelper, 'process').mockResolvedValue(parsedAuthor)
		jest.spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(parsedAuthor)
		jest.spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(false)
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

describe('AuthorShowHelper should throw error when', () => {
	test('getAuthorWithProjection is not a author type', async () => {
		jest
			.spyOn(helper.paprHelper, 'findOneWithProjection')
			.mockResolvedValue({ data: null, modified: false })
		await expect(helper.getAuthorWithProjection()).rejects.toThrow(
			`Data type for ${asin} is not ApiAuthorProfile`
		)
	})
	test('getAuthorWithProjection sorted author is not a author type', async () => {
		jest
			.spyOn(helper.sharedHelper, 'sortObjectByKeys')
			.mockReturnValue(null as unknown as ApiAuthorProfile)
		await expect(helper.getAuthorWithProjection()).rejects.toThrow(
			`Data type for ${asin} is not ApiAuthorProfile`
		)
	})
	test('createOrUpdateAuthor is not a author type', async () => {
		jest
			.spyOn(helper.paprHelper, 'createOrUpdate')
			.mockResolvedValue({ data: null, modified: false })
		await expect(helper.createOrUpdateAuthor()).rejects.toThrow(
			`Data type for ${asin} is not ApiAuthorProfile`
		)
	})
})
