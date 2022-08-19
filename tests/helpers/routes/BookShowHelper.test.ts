jest.mock('#config/models/Book')
jest.mock('#helpers/database/audible/PaprAudibleBookHelper')
jest.mock('#helpers/books/audible/StitchHelper')
jest.mock('#helpers/database/RedisHelper')

import { ObjectId } from 'mongodb'

import { BookDocument } from '#config/models/Book'
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
	jest
		.spyOn(helper.paprHelper, 'createOrUpdate')
		.mockResolvedValue({ data: bookWithoutProjection, modified: true })
	jest
		.spyOn(helper.paprHelper, 'findOne')
		.mockResolvedValue({ data: bookWithoutProjection, modified: false })
	jest.spyOn(helper.stitchHelper, 'process').mockResolvedValue(parsedBook)
	jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(bookWithoutProjection)
	jest
		.spyOn(helper.paprHelper, 'findOneWithProjection')
		.mockResolvedValue({ data: bookWithoutProjection, modified: false })
})

describe('BookShowHelper should', () => {
	test('get a book from Papr', async () => {
		await expect(helper.getBookFromPapr()).resolves.toBe(bookWithoutProjection)
	})

	test('get new book data', async () => {
		await expect(helper.getNewBookData()).resolves.toBe(parsedBook)
	})

	test('create or update a book', async () => {
		await expect(helper.createOrUpdateBook()).resolves.toStrictEqual({
			data: bookWithoutProjection,
			modified: true
		})
	})

	test('update book with timestamps returns original book', async () => {
		helper.originalBook = bookWithoutProjection
		await expect(helper.updateBookTimestamps()).resolves.toBe(bookWithoutProjection)
	})

	test('update book without timestamps returns updated book', async () => {
		helper.originalBook = bookWithId as BookDocument
		jest
			.spyOn(helper.paprHelper, 'update')
			.mockResolvedValue({ data: bookWithoutProjection, modified: true })
		await expect(helper.updateBookTimestamps()).resolves.toBe(bookWithoutProjection)
	})

	test('returns original book if it was updated recently when trying to update', async () => {
		helper.originalBook = bookWithoutProjectionUpdatedNow
		await expect(helper.updateActions()).resolves.toBe(bookWithoutProjectionUpdatedNow)
	})

	test('isUpdatedRecently returns false if no originalBook is present', () => {
		expect(helper.isUpdatedRecently()).toBe(false)
	})

	test('run all update actions', async () => {
		helper.originalBook = bookWithoutProjection
		await expect(helper.updateActions()).resolves.toBe(bookWithoutProjection)
	})

	test('run handler for a new book', async () => {
		jest.spyOn(helper.paprHelper, 'findOne').mockResolvedValue({ data: null, modified: false })
		await expect(helper.handler()).resolves.toBe(bookWithoutProjection)
	})

	test('run handler and update an existing book', async () => {
		helper = new BookShowHelper(asin, { seedAuthors: undefined, update: '1' }, null)
		jest
			.spyOn(helper.paprHelper, 'createOrUpdate')
			.mockResolvedValue({ data: bookWithoutProjection, modified: true })
		jest
			.spyOn(helper.paprHelper, 'findOne')
			.mockResolvedValue({ data: bookWithoutProjection, modified: false })
		jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(bookWithoutProjection)
		await expect(helper.handler()).resolves.toBe(bookWithoutProjection)
	})

	test('run handler for an existing book', async () => {
		jest.spyOn(helper.redisHelper, 'findOrCreate').mockResolvedValue(undefined)
		await expect(helper.handler()).resolves.toBe(bookWithoutProjection)
	})

	test('run handler for an existing book in redis', async () => {
		await expect(helper.handler()).resolves.toBe(bookWithoutProjection)
	})
})

describe('BookShowHelper should throw an error when', () => {
	test('adding timestamps to a book fails', async () => {
        // For some reason, this test fails when run with the rest of the tests
        // Manually typed out the test and it works
		helper.originalBook = {
			_id: new ObjectId('5c8f8f8f8f8f8f8f8f8f8f8f'),
			asin: 'B079LRSMNN',
			authors: [
				{ asin: 'B012DQ3BCM', name: 'Jason Anspach' },
				{ asin: 'B004W47QXE', name: 'Nick Cole' }
			],
			description:
				'On the edge of the galaxy, a diplomatic mission to an alien planet takes a turn when the Legionnaires, an elite special fighting force, find themselves ambushed and stranded behind enemy lines. They struggle to survive under siege, waiting on a rescue that might never come....',
			formatType: 'unabridged',
			image: 'https://m.media-amazon.com/images/I/91spdScZuIL.jpg',
			language: 'english',
			narrators: [{ name: 'R.C. Bray' }],
			publisherName: 'Podium Audio',
			rating: '4.5',
			releaseDate: new Date('2018-02-20T00:00:00.000Z'),
			runtimeLengthMin: 1042,
			seriesPrimary: { asin: 'B079YXK1GL', name: "Galaxy's Edge Series", position: '1-2' },
			summary:
				"<p><i>Galaxy's Edge </i>contains <i>Legionnaire </i>through to the end of <i>Galactic Outlaws</i>. </p> <p>On the edge of the galaxy, a diplomatic mission to an alien planet takes a turn when the Legionnaires, an elite special fighting force, find themselves ambushed and stranded behind enemy lines. They struggle to survive under siege, waiting on a rescue that might never come.</p> <p>In the seedy starport of Ackabar, a young girl searches the crime-ridden gutters to avenge her father's murder; not far away, a double-dealing legionniare-turned-smuggler hunts an epic payday; and somewhere along the outer galaxy, a mysterious bounty hunter lies in wait.</p> <p><i>Galaxy's Edge</i> combines sleek starfighters, exotic aliens, loyal bots, blasters, scoundrels, heroes, and powerful enemies in a thrilling adventure that will take you back to that magic place from a long time ago.</p>",
			title: "Galaxy's Edge"
		} as BookDocument
		jest
			.spyOn(helper.paprHelper, 'update')
			.mockRejectedValue(
				new Error(`An error occurred while adding timestamps to book ${asin} in the DB`)
			)
		await expect(helper.updateBookTimestamps()).rejects.toThrowError(
			`An error occurred while adding timestamps to book ${asin} in the DB`
		)
	})
})
