import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'

mock.module('#helpers/database/redis/RedisHelper', () => {
	return {
		default: class RedisHelper {
			findOne = () => Promise.resolve(null)
			setOne = () => Promise.resolve()
			findOrCreate = () => Promise.resolve(null)
		}
	}
})

mock.module('#helpers/database/papr/audible/PaprAudibleBookHelper', () => {
	return {
		default: class PaprAudibleBookHelper {
			findOne = () => Promise.resolve({ data: null, modified: false })
			findOneWithProjection = () => Promise.resolve({ data: null })
			setData = () => {}
			createOrUpdate = () => Promise.resolve({ data: null })
		}
	}
})

const mockReserveGeneration = mock(() => Promise.resolve(7))
const mockPersistObservation = mock(() =>
	Promise.resolve({ data: null, modified: false, disposition: 'accepted' as const })
)
const mockStitchProcess = mock(() => Promise.resolve(undefined))
let mockStitchObservation: BookObservation | undefined = undefined

mock.module('#config/papr', () => ({
	bookHistoryStore: {
		reserveGeneration: mockReserveGeneration,
		persistObservation: mockPersistObservation
	}
}))

mock.module('#helpers/books/audible/StitchHelper', () => ({
	default: class StitchHelper {
		process = () => mockStitchProcess()
		getHistoryObservation = () => mockStitchObservation
	}
}))

import type { FastifyBaseLogger } from 'fastify'

import type { BookObservation } from '#config/bookHistory'
import type { ApiBook } from '#config/types'
import type { PersistResult } from '#helpers/database/papr/BookHistoryStore'
import { BadRequestError, NotFoundError } from '#helpers/errors/ApiErrors'
import GenericShowHelper from '#helpers/routes/GenericShowHelper'
import { bookWithoutProjection } from '#tests/datasets/helpers/books'
import { createMockLogger } from '#tests/setup/mockLogger'

describe('GenericShowHelper handler error propagation', () => {
	let helper: GenericShowHelper
	const asin = 'B079LRSMNN'

	beforeEach(() => {
		helper = new GenericShowHelper(
			asin,
			{ region: 'us', seedAuthors: undefined, update: '1' },
			null,
			'book'
		)
	})

	test('should propagate NotFoundError with statusCode when updateActions throws', async () => {
		spyOn(helper, 'getDataFromPapr').mockResolvedValue(bookWithoutProjection)

		const notFoundError = new NotFoundError('Book not found')
		spyOn(helper, 'updateActions').mockRejectedValue(notFoundError)

		try {
			await helper.handler()
			throw new Error('Expected handler to throw')
		} catch (err: unknown) {
			const error = err as NotFoundError
			expect(error).toBeInstanceOf(NotFoundError)
			expect(error.message).toBe('Book not found')
			expect(error).toHaveProperty('statusCode', 404)
			expect(error).toHaveProperty('name', 'NotFoundError')
		}
	})

	test('should propagate BadRequestError with statusCode when updateActions throws', async () => {
		spyOn(helper, 'getDataFromPapr').mockResolvedValue(bookWithoutProjection)

		const badRequestError = new BadRequestError('Invalid request')
		spyOn(helper, 'updateActions').mockRejectedValue(badRequestError)

		try {
			await helper.handler()
			throw new Error('Expected handler to throw')
		} catch (err: unknown) {
			const error = err as BadRequestError
			expect(error).toBeInstanceOf(BadRequestError)
			expect(error.message).toBe('Invalid request')
			expect(error).toHaveProperty('statusCode', 400)
			expect(error).toHaveProperty('name', 'BadRequestError')
		}
	})

	test('should NOT wrap errors with statusCode in generic ErrorMessageUpdate', async () => {
		spyOn(helper, 'getDataFromPapr').mockResolvedValue(bookWithoutProjection)

		class CustomError extends Error {
			statusCode: number
			constructor(message: string, statusCode: number) {
				super(message)
				this.name = 'CustomError'
				this.statusCode = statusCode
			}
		}
		const customError = new CustomError('Custom error message', 418)
		spyOn(helper, 'updateActions').mockRejectedValue(customError)

		try {
			await helper.handler()
			throw new Error('Expected handler to throw')
		} catch (err: unknown) {
			const error = err as Error
			expect(error).toBeInstanceOf(CustomError)
			expect(error).toHaveProperty('statusCode', 418)
			expect(error).toHaveProperty('name', 'CustomError')
			expect(error).toHaveProperty('message', 'Custom error message')
			expect(error.message).not.toContain('An error occurred while updating')
		}
	})

	test('should wrap generic errors without statusCode in ErrorMessageUpdate', async () => {
		spyOn(helper, 'getDataFromPapr').mockResolvedValue(bookWithoutProjection)

		const genericError = new Error('Database connection failed')
		spyOn(helper, 'updateActions').mockRejectedValue(genericError)

		try {
			await helper.handler()
			throw new Error('Expected handler to throw')
		} catch (err: unknown) {
			const error = err as Error
			expect(error).toBeInstanceOf(Error)
			expect(error.message).toContain('An error occurred while updating')
			expect(error.message).toContain(asin)
			expect(error.message).not.toContain('Database connection failed')
		}
	})
})

describe('GenericShowHelper updateActions NotFoundError code handling', () => {
	let helper: GenericShowHelper
	const asin = 'B079LRSMNN'
	let mockLogger: ReturnType<typeof createMockLogger>

	beforeEach(() => {
		mockLogger = createMockLogger()
		helper = new GenericShowHelper(
			asin,
			{ region: 'us', seedAuthors: undefined, update: '1' },
			null,
			'book',
			mockLogger
		)
	})

	test('should swallow NotFoundError with REGION_UNAVAILABLE and return projected data', async () => {
		helper.originalData = bookWithoutProjection
		spyOn(helper, 'isUpdatedRecently').mockReturnValue(false)

		const regionError = new NotFoundError('Region unavailable', {
			code: 'REGION_UNAVAILABLE'
		})
		spyOn(helper, 'createOrUpdateData').mockRejectedValue(regionError)

		const projectedData = { asin, title: 'Test Book' } as never
		spyOn(helper, 'getDataWithProjection').mockResolvedValue(projectedData)

		const result = await helper.updateActions()
		expect(result).toBe(projectedData)

		expect(mockLogger.warn).toHaveBeenCalledTimes(1)
		const warnMessage = (mockLogger.warn as ReturnType<typeof mock>).mock.calls[0][0] as string
		expect(warnMessage).toContain('book')
		expect(warnMessage).toContain(asin)
	})

	test('should swallow NotFoundError with PRODUCT_DELISTED and return projected data', async () => {
		helper.originalData = bookWithoutProjection
		spyOn(helper, 'isUpdatedRecently').mockReturnValue(false)

		const delistedError = new NotFoundError('Product delisted', {
			code: 'PRODUCT_DELISTED'
		})
		spyOn(helper, 'createOrUpdateData').mockRejectedValue(delistedError)

		const projectedData = { asin, title: 'Test Book' } as never
		spyOn(helper, 'getDataWithProjection').mockResolvedValue(projectedData)

		const result = await helper.updateActions()
		expect(result).toBe(projectedData)

		expect(mockLogger.warn).toHaveBeenCalledTimes(1)
		const warnMessage = (mockLogger.warn as ReturnType<typeof mock>).mock.calls[0][0] as string
		expect(warnMessage).toContain('book')
		expect(warnMessage).toContain(asin)
	})

	test('should rethrow NotFoundError with unrecognized code', async () => {
		helper.originalData = bookWithoutProjection
		spyOn(helper, 'isUpdatedRecently').mockReturnValue(false)

		const otherError = new NotFoundError('Not found for other reason', {
			code: 'SOME_OTHER_CODE'
		})
		spyOn(helper, 'createOrUpdateData').mockRejectedValue(otherError)

		try {
			await helper.updateActions()
			throw new Error('Expected updateActions to throw')
		} catch (err: unknown) {
			const error = err as NotFoundError
			expect(error).toBeInstanceOf(NotFoundError)
			expect(error.message).toBe('Not found for other reason')
			expect(error).toHaveProperty('statusCode', 404)
		}

		expect(mockLogger.warn).toHaveBeenCalledTimes(0)
	})
})

describe('GenericShowHelper updateActions non-Error rejection handling', () => {
	let helper: GenericShowHelper
	const asin = 'B079LRSMNN'

	beforeEach(() => {
		helper = new GenericShowHelper(
			asin,
			{ region: 'us', seedAuthors: undefined, update: '1' },
			null,
			'book'
		)
	})

	test('should wrap string rejection in Error with cause', async () => {
		helper.originalData = bookWithoutProjection
		spyOn(helper, 'isUpdatedRecently').mockReturnValue(false)

		const stringError = 'Something went wrong'
		spyOn(helper, 'createOrUpdateData').mockRejectedValue(stringError)

		try {
			await helper.updateActions()
			throw new Error('Expected updateActions to throw')
		} catch (err: unknown) {
			const error = err as Error
			expect(error).toBeInstanceOf(Error)
			expect(error.message).toBe('Something went wrong')
			expect(error.cause).toBe(stringError)
		}
	})

	test('should wrap null rejection in Error with cause', async () => {
		helper.originalData = bookWithoutProjection
		spyOn(helper, 'isUpdatedRecently').mockReturnValue(false)

		spyOn(helper, 'createOrUpdateData').mockRejectedValue(null)

		try {
			await helper.updateActions()
			throw new Error('Expected updateActions to throw')
		} catch (err: unknown) {
			const error = err as Error
			expect(error).toBeInstanceOf(Error)
			expect(error.message).toBe('null')
			expect(error.cause).toBe(null)
		}
	})

	test('should wrap plain object rejection in Error with cause', async () => {
		helper.originalData = bookWithoutProjection
		spyOn(helper, 'isUpdatedRecently').mockReturnValue(false)

		const objectError = { code: 'E123', message: 'Custom error' }
		spyOn(helper, 'createOrUpdateData').mockRejectedValue(objectError)

		try {
			await helper.updateActions()
			throw new Error('Expected updateActions to throw')
		} catch (err: unknown) {
			const error = err as Error
			expect(error).toBeInstanceOf(Error)
			expect(error.message).toBe('[object Object]')
			expect(error.cause).toBe(objectError)
		}
	})

	test('should wrap number rejection in Error with cause', async () => {
		helper.originalData = bookWithoutProjection
		spyOn(helper, 'isUpdatedRecently').mockReturnValue(false)

		spyOn(helper, 'createOrUpdateData').mockRejectedValue(42)

		try {
			await helper.updateActions()
			throw new Error('Expected updateActions to throw')
		} catch (err: unknown) {
			const error = err as Error
			expect(error).toBeInstanceOf(Error)
			expect(error.message).toBe('42')
			expect(error.cause).toBe(42)
		}
	})

	test('should wrap undefined rejection in Error with cause', async () => {
		helper.originalData = bookWithoutProjection
		spyOn(helper, 'isUpdatedRecently').mockReturnValue(false)

		spyOn(helper, 'createOrUpdateData').mockRejectedValue(undefined)

		try {
			await helper.updateActions()
			throw new Error('Expected updateActions to throw')
		} catch (err: unknown) {
			const error = err as Error
			expect(error).toBeInstanceOf(Error)
			expect(error.message).toBe('undefined')
			expect(error.cause).toBe(undefined)
		}
	})
})

describe('GenericShowHelper pre-order transient handling', () => {
	let helper: GenericShowHelper
	const asin = 'B0DLQ2TZCD'
	let mockLogger: ReturnType<typeof createMockLogger>

	beforeEach(() => {
		mockLogger = createMockLogger()
		helper = new GenericShowHelper(
			asin,
			{ region: 'us', seedAuthors: undefined, update: '1' },
			null,
			'book',
			mockLogger
		)
	})

	test('returns pre-order data transiently when existing record is present', async () => {
		const futureDate = new Date()
		futureDate.setFullYear(futureDate.getFullYear() + 1)
		const preOrderBook = {
			...(bookWithoutProjection as unknown as ApiBook),
			releaseDate: futureDate
		} as ApiBook

		// Set originalData to simulate an existing cached/stored record
		helper.originalData = bookWithoutProjection

		spyOn(helper, 'getNewData').mockResolvedValue(preOrderBook)
		const setDataSpy = spyOn(helper.paprHelper, 'setData')
		const createOrUpdateSpy = spyOn(helper.paprHelper, 'createOrUpdate')
		const setOneSpy = spyOn(helper.redisHelper, 'setOne')

		const result = await helper.createOrUpdateData()

		expect(result).toBe(preOrderBook)
		expect(setDataSpy).not.toHaveBeenCalled()
		expect(createOrUpdateSpy).not.toHaveBeenCalled()
		expect(setOneSpy).not.toHaveBeenCalled()
		expect(mockLogger.info).toHaveBeenCalledTimes(1)
	})

	test('persists pre-order data on first-time fetch (no existing record)', async () => {
		const futureDate = new Date()
		futureDate.setFullYear(futureDate.getFullYear() + 1)
		const preOrderBook = {
			...(bookWithoutProjection as unknown as ApiBook),
			releaseDate: futureDate
		} as ApiBook

		// originalData is null (default) — first-time fetch
		expect(helper.originalData).toBeNull()

		spyOn(helper, 'getNewData').mockResolvedValue(preOrderBook)
		const setDataSpy = spyOn(helper.paprHelper, 'setData')
		const createOrUpdateSpy = spyOn(helper.paprHelper, 'createOrUpdate')
		createOrUpdateSpy.mockResolvedValue({ data: preOrderBook })
		spyOn(helper, 'getDataWithProjection').mockResolvedValue(preOrderBook)
		const setOneSpy = spyOn(helper.redisHelper, 'setOne')

		await helper.createOrUpdateData()

		// Persistence SHOULD happen for first-time pre-order fetches
		expect(setDataSpy).toHaveBeenCalledTimes(1)
		expect(createOrUpdateSpy).toHaveBeenCalledTimes(1)
		expect(setOneSpy).toHaveBeenCalledTimes(1)
	})

	test('persists released books normally (releaseDate in the past)', async () => {
		const pastBook = {
			...(bookWithoutProjection as unknown as ApiBook),
			releaseDate: new Date('2020-01-01')
		} as ApiBook

		spyOn(helper, 'getNewData').mockResolvedValue(pastBook)
		const setDataSpy = spyOn(helper.paprHelper, 'setData')
		const createOrUpdateSpy = spyOn(helper.paprHelper, 'createOrUpdate')
		createOrUpdateSpy.mockResolvedValue({ data: pastBook })
		spyOn(helper, 'getDataWithProjection').mockResolvedValue(pastBook)
		const setOneSpy = spyOn(helper.redisHelper, 'setOne')

		await helper.createOrUpdateData()

		expect(setDataSpy).toHaveBeenCalledTimes(1)
		expect(createOrUpdateSpy).toHaveBeenCalledTimes(1)
		expect(setOneSpy).toHaveBeenCalledTimes(1)
	})

	test('sets fetchedFreshData on the normal persistence path', async () => {
		const pastBook = {
			...(bookWithoutProjection as unknown as ApiBook),
			releaseDate: new Date('2020-01-01')
		} as ApiBook

		spyOn(helper, 'getNewData').mockResolvedValue(pastBook)
		spyOn(helper.paprHelper, 'createOrUpdate').mockResolvedValue({ data: pastBook })
		spyOn(helper, 'getDataWithProjection').mockResolvedValue(pastBook)

		const result = await helper.createOrUpdateData()

		expect(result).toBe(pastBook)
		expect(helper.fetchedFreshData).toBe(true)
	})

	test('sets persisted only when createOrUpdate actually wrote', async () => {
		const pastBook = {
			...(bookWithoutProjection as unknown as ApiBook),
			releaseDate: new Date('2020-01-01')
		} as ApiBook

		spyOn(helper, 'getNewData').mockResolvedValue(pastBook)
		spyOn(helper.paprHelper, 'createOrUpdate').mockResolvedValue({ data: pastBook, modified: true })
		spyOn(helper, 'getDataWithProjection').mockResolvedValue(pastBook)

		await helper.createOrUpdateData()
		expect(helper.persisted).toBe(true)

		// Identical-data no-op: the papr helpers resolve without writing
		// (`modified: false`); the row must count as `unchanged` so the
		// scheduler marks it checked instead of re-fetching every pass.
		spyOn(helper, 'getNewData').mockResolvedValue(pastBook)
		spyOn(helper.paprHelper, 'createOrUpdate').mockResolvedValue({ data: pastBook, modified: false })
		spyOn(helper, 'getDataWithProjection').mockResolvedValue(pastBook)

		await helper.createOrUpdateData()
		expect(helper.persisted).toBe(false)
	})

	test('sets fetchedFreshData on the pre-order transient path', async () => {
		const futureDate = new Date()
		futureDate.setFullYear(futureDate.getFullYear() + 1)
		const preOrderBook = {
			...(bookWithoutProjection as unknown as ApiBook),
			releaseDate: futureDate
		} as ApiBook

		// Existing record → transient return without persistence
		helper.originalData = bookWithoutProjection

		spyOn(helper, 'getNewData').mockResolvedValue(preOrderBook)

		const result = await helper.createOrUpdateData()

		expect(result).toBe(preOrderBook)
		expect(helper.fetchedFreshData).toBe(true)
	})
})

describe('GenericShowHelper history-enabled persist dispositions', () => {
	const asin = 'B079LRSMNN'
	const region = 'us'
	let helper: GenericShowHelper
	let mockLogger: FastifyBaseLogger
	const savedEnv = process.env.BOOK_HISTORY_ENABLED

	const apiBook = {
		...(bookWithoutProjection as unknown as ApiBook),
		releaseDate: new Date('2020-01-01')
	} as ApiBook
	const storedBook = {
		...(bookWithoutProjection as unknown as ApiBook),
		releaseDate: new Date('2019-06-01')
	} as ApiBook
	const observation: BookObservation = {
		observedAt: new Date('2026-11-07T12:00:00.000Z'),
		apiReceivedAt: new Date('2026-11-07T12:00:00.000Z'),
		responseGroups: ['category_ladders'],
		requestedRenditions: ['500', '1024'],
		fields: [
			{
				field: 'title',
				policy: 'editorial:title:v1',
				value: { state: 'value', value: 'Galaxy' },
				source: 'audible_api'
			}
		],
		artwork: []
	}

	beforeEach(() => {
		process.env.BOOK_HISTORY_ENABLED = 'true'
		mockLogger = createMockLogger()
		helper = new GenericShowHelper(
			asin,
			{ region, seedAuthors: undefined, update: '1' },
			null,
			'book',
			mockLogger
		)
		helper.originalData = bookWithoutProjection
		spyOn(helper, 'isUpdatedRecently').mockReturnValue(false)
		spyOn(helper, 'getDataFromPapr').mockResolvedValue(bookWithoutProjection)
		// No redis hit: the handler falls through to the DB path and updateActions.
		spyOn(helper.redisHelper, 'findOne').mockResolvedValue(null)
		mockReserveGeneration.mockClear()
		mockPersistObservation.mockClear()
		mockStitchProcess.mockClear()
		mockStitchProcess.mockResolvedValue(apiBook)
		mockStitchObservation = observation
	})

	afterEach(() => {
		if (savedEnv === undefined) delete process.env.BOOK_HISTORY_ENABLED
		else process.env.BOOK_HISTORY_ENABLED = savedEnv
	})

	const dispositions: [string, PersistResult][] = [
		['rejected', { data: null, modified: false, disposition: 'rejected' }],
		['stale', { data: null, modified: false, disposition: 'stale' }],
		['accepted', { data: storedBook, modified: true, disposition: 'accepted' }],
		['accepted-unchanged', { data: storedBook, modified: false, disposition: 'accepted' }]
	]

	test.each(dispositions)('persistObservation disposition %s', async (disposition, persistResult) => {
		mockPersistObservation.mockResolvedValue(persistResult)
		spyOn(helper, 'getDataWithProjection').mockResolvedValue(storedBook)
		const setOneSpy = spyOn(helper.redisHelper, 'setOne')

		let result: ApiBook | undefined
		let error: unknown
		try {
			result = (await helper.handler()) as ApiBook
		} catch (err) {
			error = err
		}

		// The history path is taken: the generation is reserved before the
		// fetch and the observation persisted under it.
		expect(mockReserveGeneration).toHaveBeenCalledTimes(1)
		expect(mockReserveGeneration).toHaveBeenCalledWith(asin, region)
		expect(mockStitchProcess).toHaveBeenCalledTimes(1)
		expect(mockPersistObservation).toHaveBeenCalledTimes(1)
		expect(mockPersistObservation).toHaveBeenCalledWith({
			asin,
			region,
			generation: 7,
			book: apiBook,
			observation
		})

		if (disposition === 'rejected') {
			// The update is refused; the stored projection stands with 200.
			expect(result).toBe(storedBook)
			expect(setOneSpy).toHaveBeenCalledTimes(1)
			expect(setOneSpy).toHaveBeenCalledWith(storedBook, { log: false })
		} else if (disposition === 'stale') {
			// A concurrent delete left no current row: the book is gone.
			expect(error).toBeInstanceOf(NotFoundError)
			expect(error).toHaveProperty('statusCode', 404)
			expect(error).toHaveProperty('message', `Book ${asin} not found in region ${region}`)
			expect(setOneSpy).not.toHaveBeenCalled()
		} else {
			// The fresh data is returned and written to the redis cache.
			expect(result).toBe(storedBook)
			expect(setOneSpy).toHaveBeenCalledTimes(1)
			expect(setOneSpy).toHaveBeenCalledWith(storedBook, { log: false })
			// `persisted` tracks the write, not the acceptance: a modified
			// acceptance is a real write; the equal short-circuit
			// (accepted but unchanged) is not.
			expect(helper.persisted).toBe(persistResult.modified === true)
		}
	})

	test.each([
		['rejected', { data: null, modified: false, disposition: 'rejected' as const }],
		['accepted', { data: storedBook, modified: true, disposition: 'accepted' as const }]
	])(
		'cache refresh failure after a committed %s disposition still resolves to the projection',
		async (disposition, persistResult) => {
			mockPersistObservation.mockResolvedValue(persistResult)
			spyOn(helper, 'getDataWithProjection').mockResolvedValue(storedBook)
			// `setOne` rethrows on a cache failure; a committed persistence
			// must not become a 500 — the refresh is best-effort.
			spyOn(helper.redisHelper, 'setOne').mockRejectedValue(new Error('redis down'))

			const result = (await helper.handler()) as ApiBook

			expect(result).toBe(storedBook)
			expect(mockLogger.error).toHaveBeenCalledTimes(1)
			const message = (mockLogger.error as ReturnType<typeof mock>).mock.calls[0][0] as string
			expect(message).toBe(
				`History cache refresh failed for book ${asin} (data is persisted): Error: redis down`
			)
		}
	)

	test('missing observation → legacy persist path with warning', async () => {
		mockStitchObservation = undefined

		spyOn(helper.paprHelper, 'createOrUpdate').mockResolvedValue({ data: apiBook, modified: true })
		spyOn(helper, 'getDataWithProjection').mockResolvedValue(apiBook)
		const setDataSpy = spyOn(helper.paprHelper, 'setData')
		const setOneSpy = spyOn(helper.redisHelper, 'setOne')

		const result = (await helper.handler()) as ApiBook

		expect(result).toBe(apiBook)
		// The reserved generation is consumed without establishing resources:
		// persistObservation is never called, the legacy papr write runs.
		expect(mockReserveGeneration).toHaveBeenCalledTimes(1)
		expect(mockPersistObservation).not.toHaveBeenCalled()
		expect(setDataSpy).toHaveBeenCalledTimes(1)
		expect(setDataSpy).toHaveBeenCalledWith(apiBook)
		expect(helper.paprHelper.createOrUpdate).toHaveBeenCalledTimes(1)
		expect(setOneSpy).toHaveBeenCalledTimes(1)
		expect(setOneSpy).toHaveBeenCalledWith(apiBook)
		expect(helper.persisted).toBe(true)
		expect(mockLogger.warn).toHaveBeenCalledTimes(1)
		const warnMessage = (mockLogger.warn as ReturnType<typeof mock>).mock.calls[0][0] as string
		expect(warnMessage).toBe(`History evidence missing for ${asin}; persisting via legacy path.`)
	})
})

afterAll(() => {
	mock.restore()
})
