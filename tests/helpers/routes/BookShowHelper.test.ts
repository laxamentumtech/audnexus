import Book, { BookDocument } from '#config/models/Book'
import BookShowHelper from '#helpers/routes/BookShowHelper'
import {
	bookWithId,
	bookWithoutProjection,
	bookWithoutProjectionUpdatedNow,
	parsedBook
} from '#tests/datasets/helpers/books'

let asin: string
let helper: BookShowHelper

beforeEach(() => {
	asin = 'B079LRSMNN'
	helper = new BookShowHelper(asin, { seedAuthors: undefined, update: undefined }, null)
	jest.spyOn(Book, 'findOne').mockResolvedValue(bookWithoutProjection)
	jest
		.spyOn(helper.paprHelper, 'createOrUpdate')
		.mockResolvedValue({ data: bookWithoutProjection, modified: true })
})

describe('BookShowHelper should', () => {
	test('get a book from Papr', async () => {
		await expect(helper.getBookFromPapr()).resolves.toBe(bookWithoutProjection)
	})

	test('get new book data', async () => {
		jest.spyOn(helper.stitchHelper, 'process').mockResolvedValue(parsedBook)
		await expect(helper.getNewBookData()).resolves.toBe(parsedBook)
	})

	test('create or update a book', async () => {
		jest.spyOn(helper, 'getNewBookData').mockResolvedValue(parsedBook)
		await expect(helper.createOrUpdateBook()).resolves.toStrictEqual({
			data: bookWithoutProjection,
			modified: true
		})
	})

	test('update book with timestamps returns original book', async () => {
		helper.originalBook = bookWithoutProjection
		await expect(helper.updateBookTimestamps()).resolves.toBe(bookWithoutProjection)
	})

	test('update book without timestamps returns new book', async () => {
		helper.originalBook = bookWithId as BookDocument
		jest
			.spyOn(helper.paprHelper, 'update')
			.mockResolvedValue({ data: bookWithoutProjection, modified: true })
		await expect(helper.updateBookTimestamps()).resolves.toBe(bookWithoutProjection)
	})

	test('update that book is updated recently', async () => {
		helper.originalBook = bookWithoutProjectionUpdatedNow
		await expect(helper.updateActions()).resolves.toBe(bookWithoutProjectionUpdatedNow)
	})

	test('run all update actions', async () => {
		helper.originalBook = bookWithoutProjection
		await expect(helper.updateActions()).resolves.toBe(bookWithoutProjection)
	})

	test('run handler for a new book', async () => {
		jest.spyOn(helper, 'getBookFromPapr').mockResolvedValue(null)
		jest.spyOn(helper, 'updateActions').mockResolvedValue(bookWithoutProjection)
		await expect(helper.handler()).resolves.toBe(bookWithoutProjection)
	})

	test('run handler and update an existing book', async () => {
		helper.options.update = '1'
		jest.spyOn(helper, 'getBookFromPapr').mockResolvedValue(bookWithoutProjection)
		await expect(helper.handler()).resolves.toBe(bookWithoutProjection)
	})

	test('run handler for an existing book', async () => {
		jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(undefined)
		jest.spyOn(helper, 'getBookFromPapr').mockResolvedValue(bookWithoutProjection)
		await expect(helper.handler()).resolves.toBe(bookWithoutProjection)
	})

	test('run handler for an existing book in redis', async () => {
		jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(bookWithoutProjection)
		await expect(helper.handler()).resolves.toBe(bookWithoutProjection)
	})
})
