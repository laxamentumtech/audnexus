jest.mock('#helpers/database/redis/RedisHelper')
jest.mock('#helpers/database/papr/audible/PaprAudibleBookHelper')

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
		jest.spyOn(helper, 'getDataFromPapr').mockResolvedValue(bookWithoutProjection)

		// Create a NotFoundError with statusCode
		const notFoundError = new NotFoundError('Book not found')

		// Mock updateActions to throw the NotFoundError
		jest.spyOn(helper, 'updateActions').mockRejectedValue(notFoundError)

		// Call handler once and verify it throws the NotFoundError with statusCode preserved
		try {
			await helper.handler()
			fail('Expected handler to throw')
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
		jest.spyOn(helper, 'getDataFromPapr').mockResolvedValue(bookWithoutProjection)

		// Create a BadRequestError with statusCode
		const badRequestError = new BadRequestError('Invalid request')

		// Mock updateActions to throw the BadRequestError
		jest.spyOn(helper, 'updateActions').mockRejectedValue(badRequestError)

		// Call handler once and verify it throws the BadRequestError with statusCode preserved
		try {
			await helper.handler()
			fail('Expected handler to throw')
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
		jest.spyOn(helper, 'getDataFromPapr').mockResolvedValue(bookWithoutProjection)

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
		jest.spyOn(helper, 'updateActions').mockRejectedValue(customError)

		// Call handler and expect it to throw the SAME custom error, not wrapped
		try {
			await helper.handler()
			fail('Expected handler to throw')
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
		jest.spyOn(helper, 'getDataFromPapr').mockResolvedValue(bookWithoutProjection)

		// Create a generic error without statusCode
		const genericError = new Error('Database connection failed')

		// Mock updateActions to throw the generic error
		jest.spyOn(helper, 'updateActions').mockRejectedValue(genericError)

		// Call handler and expect it to wrap the error in ErrorMessageUpdate
		try {
			await helper.handler()
			fail('Expected handler to throw')
		} catch (err: unknown) {
			const error = err as Error
			expect(error).toBeInstanceOf(Error)
			expect(error.message).toContain('An error occurred while updating')
			expect(error.message).toContain(asin)
			expect(error.message).not.toContain('Database connection failed')
		}
	})
})
