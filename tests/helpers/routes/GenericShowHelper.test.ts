import { beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'

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

import { BadRequestError, NotFoundError } from '#helpers/errors/ApiErrors'
import GenericShowHelper from '#helpers/routes/GenericShowHelper'
import { bookWithoutProjection } from '#tests/datasets/helpers/books'

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
		// Mock getDataFromPapr to return data so it enters the update path
		spyOn(helper, 'getDataFromPapr').mockResolvedValue(bookWithoutProjection)

		// Create a NotFoundError with statusCode
		const notFoundError = new NotFoundError('Book not found')

		// Mock updateActions to throw the NotFoundError
		spyOn(helper, 'updateActions').mockRejectedValue(notFoundError)

		// Call handler once and verify it throws the NotFoundError with statusCode preserved
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
		// Mock getDataFromPapr to return data so it enters the update path
		spyOn(helper, 'getDataFromPapr').mockResolvedValue(bookWithoutProjection)

		// Create a BadRequestError with statusCode
		const badRequestError = new BadRequestError('Invalid request')

		// Mock updateActions to throw the BadRequestError
		spyOn(helper, 'updateActions').mockRejectedValue(badRequestError)

		// Call handler once and verify it throws the BadRequestError with statusCode preserved
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
		// Mock getDataFromPapr to return data so it enters the update path
		spyOn(helper, 'getDataFromPapr').mockResolvedValue(bookWithoutProjection)

		// Create a custom error with statusCode
		class CustomError extends Error {
			statusCode: number
			constructor(message: string, statusCode: number) {
				super(message)
				this.name = 'CustomError'
				this.statusCode = statusCode
			}
		}
		const customError = new CustomError('Custom error message', 418)

		// Mock updateActions to throw the custom error
		spyOn(helper, 'updateActions').mockRejectedValue(customError)

		// Call handler and expect it to throw the SAME custom error, not wrapped
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
		// Mock getDataFromPapr to return data so it enters the update path
		spyOn(helper, 'getDataFromPapr').mockResolvedValue(bookWithoutProjection)

		// Create a generic error without statusCode
		const genericError = new Error('Database connection failed')

		// Mock updateActions to throw the generic error
		spyOn(helper, 'updateActions').mockRejectedValue(genericError)

		// Call handler and expect it to wrap the error in ErrorMessageUpdate
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
		// Set originalData so updateActions doesn't throw immediately
		helper.originalData = bookWithoutProjection

		// Mock isUpdatedRecently to return false so it proceeds to update
		spyOn(helper, 'isUpdatedRecently').mockReturnValue(false)

		// Mock createOrUpdateData to reject with a string (non-Error value)
		const stringError = 'Something went wrong'
		spyOn(helper, 'createOrUpdateData').mockRejectedValue(stringError)

		// Call updateActions and verify it wraps the string in an Error
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
		// Set originalData so updateActions doesn't throw immediately
		helper.originalData = bookWithoutProjection

		// Mock isUpdatedRecently to return false so it proceeds to update
		spyOn(helper, 'isUpdatedRecently').mockReturnValue(false)

		// Mock createOrUpdateData to reject with null (non-Error value)
		spyOn(helper, 'createOrUpdateData').mockRejectedValue(null)

		// Call updateActions and verify it wraps null in an Error
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
		// Set originalData so updateActions doesn't throw immediately
		helper.originalData = bookWithoutProjection

		// Mock isUpdatedRecently to return false so it proceeds to update
		spyOn(helper, 'isUpdatedRecently').mockReturnValue(false)

		// Mock createOrUpdateData to reject with a plain object (non-Error value)
		const objectError = { code: 'E123', message: 'Custom error' }
		spyOn(helper, 'createOrUpdateData').mockRejectedValue(objectError)

		// Call updateActions and verify it wraps the object in an Error
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
		// Set originalData so updateActions doesn't throw immediately
		helper.originalData = bookWithoutProjection

		// Mock isUpdatedRecently to return false so it proceeds to update
		spyOn(helper, 'isUpdatedRecently').mockReturnValue(false)

		// Mock createOrUpdateData to reject with a number (non-Error value)
		spyOn(helper, 'createOrUpdateData').mockRejectedValue(42)

		// Call updateActions and verify it wraps the number in an Error
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
		// Set originalData so updateActions doesn't throw immediately
		helper.originalData = bookWithoutProjection

		// Mock isUpdatedRecently to return false so it proceeds to update
		spyOn(helper, 'isUpdatedRecently').mockReturnValue(false)

		// Mock createOrUpdateData to reject with undefined (non-Error value)
		spyOn(helper, 'createOrUpdateData').mockRejectedValue(undefined)

		// Call updateActions and verify it wraps undefined in an Error
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
