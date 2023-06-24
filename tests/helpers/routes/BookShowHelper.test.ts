import type { AxiosResponse } from 'axios'

import { ApiBook } from '#config/types'
import BookShowHelper from '#helpers/routes/BookShowHelper'
import * as fetchPlus from '#helpers/utils/fetchPlus'
import {
	bookWithoutProjection,
	bookWithoutProjectionUpdatedNow,
	parsedBook
} from '#tests/datasets/helpers/books'

jest.mock('#config/models/Book')
jest.mock('#helpers/database/papr/audible/PaprAudibleBookHelper')
jest.mock('#helpers/books/audible/StitchHelper')
jest.mock('#helpers/database/redis/RedisHelper')
jest.mock('#helpers/utils/fetchPlus')

let asin: string
let helper: BookShowHelper

beforeEach(() => {
	asin = 'B079LRSMNN'
	helper = new BookShowHelper(
		asin,
		{ region: 'us', seedAuthors: undefined, update: undefined },
		null
	)
	jest
		.spyOn(helper.paprHelper, 'createOrUpdate')
		.mockResolvedValue({ data: parsedBook, modified: true })
	jest
		.spyOn(helper.paprHelper, 'findOne')
		.mockResolvedValue({ data: bookWithoutProjection, modified: false })
	jest.spyOn(helper.stitchHelper, 'process').mockResolvedValue(parsedBook)
	jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(parsedBook)
	jest
		.spyOn(helper.paprHelper, 'findOneWithProjection')
		.mockResolvedValue({ data: parsedBook, modified: false })
	jest
		.spyOn(fetchPlus, 'default')
		.mockImplementation(() => Promise.resolve({ status: 200 } as AxiosResponse))
	jest.spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(parsedBook)
	jest.spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(false)
})

describe('BookShowHelper should', () => {
	test('get a book from Papr', async () => {
		await expect(helper.getBookFromPapr()).resolves.toBe(bookWithoutProjection)
	})

	test('get new book data', async () => {
		await expect(helper.getNewBookData()).resolves.toBe(parsedBook)
	})

	test('create or update a book', async () => {
		await expect(helper.createOrUpdateBook()).resolves.toStrictEqual(parsedBook)
	})

	test('returns original book if it was updated recently when trying to update', async () => {
		jest.spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(true)
		helper.originalBook = bookWithoutProjectionUpdatedNow
		await expect(helper.updateActions()).resolves.toStrictEqual(parsedBook)
	})

	test('isUpdatedRecently returns false if no originalBook is present', () => {
		expect(helper.isUpdatedRecently()).toBe(false)
	})

	test('run all update actions', async () => {
		helper.originalBook = bookWithoutProjection
		await expect(helper.updateActions()).resolves.toStrictEqual(parsedBook)
	})

	test('run handler for a new book', async () => {
		jest.spyOn(helper.paprHelper, 'findOne').mockResolvedValue({ data: null, modified: false })
		await expect(helper.handler()).resolves.toStrictEqual(parsedBook)
	})

	test('run handler and update an existing book', async () => {
		helper = new BookShowHelper(asin, { region: 'us', seedAuthors: undefined, update: '1' }, null)
		// Need to re-do mock since helper reset
		jest
			.spyOn(helper.paprHelper, 'findOne')
			.mockResolvedValue({ data: bookWithoutProjection, modified: false })
		jest
			.spyOn(helper.paprHelper, 'createOrUpdate')
			.mockResolvedValue({ data: parsedBook, modified: true })
		jest
			.spyOn(helper.paprHelper, 'findOneWithProjection')
			.mockResolvedValue({ data: parsedBook, modified: false })
		jest.spyOn(helper.stitchHelper, 'process').mockResolvedValue(parsedBook)
		jest.spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(parsedBook)
		jest.spyOn(helper.sharedHelper, 'isRecentlyUpdated').mockReturnValue(false)
		await expect(helper.handler()).resolves.toStrictEqual(parsedBook)
	})

	test('run handler for an existing book', async () => {
		jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(undefined)
		await expect(helper.handler()).resolves.toStrictEqual(parsedBook)
	})

	test('run handler for an existing book in redis', async () => {
		await expect(helper.handler()).resolves.toStrictEqual(parsedBook)
	})
})

describe('BookShowHelper should throw error when', () => {
	test('getBookWithProjection is not a book type', async () => {
		jest
			.spyOn(helper.paprHelper, 'findOneWithProjection')
			.mockResolvedValue({ data: null, modified: false })
		await expect(helper.getBookWithProjection()).rejects.toThrow(
			`Data type for ${asin} is not Book`
		)
	})
	test('getBookWithProjection sorted book is not a book type', async () => {
		jest.spyOn(helper.sharedHelper, 'sortObjectByKeys').mockReturnValue(null as unknown as ApiBook)
		await expect(helper.getBookWithProjection()).rejects.toThrow(
			`Data type for ${asin} is not Book`
		)
	})
	test('createOrUpdateBook is not a book type', async () => {
		jest
			.spyOn(helper.paprHelper, 'createOrUpdate')
			.mockResolvedValue({ data: null, modified: false })
		await expect(helper.createOrUpdateBook()).rejects.toThrow(`Data type for ${asin} is not Book`)
	})
	test('update has no originalBook', async () => {
		helper.originalBook = null
		await expect(helper.updateActions()).rejects.toThrow(
			`Missing original Book data for ASIN: ${asin}`
		)
	})
})
