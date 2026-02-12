import { BadRequestError, NotFoundError } from '#helpers/errors/ApiErrors'

describe('NotFoundError', () => {
	test('should have statusCode 404', () => {
		const error = new NotFoundError('Item not found')
		expect(error.statusCode).toBe(404)
	})

	test('should have correct name', () => {
		const error = new NotFoundError('Item not found')
		expect(error.name).toBe('NotFoundError')
	})

	test('should have correct message', () => {
		const message = 'Item not available in region us for ASIN: B017V4U2VQ'
		const error = new NotFoundError(message)
		expect(error.message).toBe(message)
	})

	test('should be an instance of Error', () => {
		const error = new NotFoundError('Item not found')
		expect(error).toBeInstanceOf(Error)
	})

	test('should have a stack trace', () => {
		const error = new NotFoundError('Item not found')
		expect(error.stack).toBeDefined()
	})
})

describe('BadRequestError', () => {
	test('should have statusCode 400', () => {
		const error = new BadRequestError('Bad request')
		expect(error.statusCode).toBe(400)
	})

	test('should have correct name', () => {
		const error = new BadRequestError('Bad request')
		expect(error.name).toBe('BadRequestError')
	})

	test('should have correct message', () => {
		const message = 'Bad ASIN'
		const error = new BadRequestError(message)
		expect(error.message).toBe(message)
	})

	test('should be an instance of Error', () => {
		const error = new BadRequestError('Bad request')
		expect(error).toBeInstanceOf(Error)
	})

	test('should have a stack trace', () => {
		const error = new BadRequestError('Bad request')
		expect(error.stack).toBeDefined()
	})
})

describe('Error classes preserve error semantics', () => {
	test('NotFoundError can be caught as Error', () => {
		try {
			throw new NotFoundError('Not found')
		} catch (err) {
			expect(err).toBeInstanceOf(Error)
			expect(err).toBeInstanceOf(NotFoundError)
		}
	})

	test('BadRequestError can be caught as Error', () => {
		try {
			throw new BadRequestError('Bad request')
		} catch (err) {
			expect(err).toBeInstanceOf(Error)
			expect(err).toBeInstanceOf(BadRequestError)
		}
	})

	test('statusCode property is enumerable and accessible', () => {
		const notFound = new NotFoundError('Test')
		const badRequest = new BadRequestError('Test')

		expect('statusCode' in notFound).toBe(true)
		expect('statusCode' in badRequest).toBe(true)
		expect(notFound.statusCode).toBe(404)
		expect(badRequest.statusCode).toBe(400)
	})
})
