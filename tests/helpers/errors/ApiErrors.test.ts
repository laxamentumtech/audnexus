import {
	BadRequestError,
	ContentTypeMismatchError,
	NotFoundError,
	ValidationError
} from '#helpers/errors/ApiErrors'

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

describe('NotFoundError with details', () => {
	test('should accept optional details parameter', () => {
		const details = { asin: 'B017V4U2VQ', region: 'us' }
		const error = new NotFoundError('Item not found', details)
		expect(error.details).toEqual(details)
	})

	test('should have undefined details when not provided', () => {
		const error = new NotFoundError('Item not found')
		expect(error.details).toBeUndefined()
	})
})

describe('BadRequestError with details', () => {
	test('should accept optional details parameter', () => {
		const details = { asin: 'INVALID', reason: 'invalid format' }
		const error = new BadRequestError('Invalid ASIN', details)
		expect(error.details).toEqual(details)
	})

	test('should have undefined details when not provided', () => {
		const error = new BadRequestError('Bad request')
		expect(error.details).toBeUndefined()
	})
})

describe('ContentTypeMismatchError', () => {
	test('should have statusCode 400', () => {
		const error = new ContentTypeMismatchError('Content type mismatch')
		expect(error.statusCode).toBe(400)
	})

	test('should have correct name', () => {
		const error = new ContentTypeMismatchError('Content type mismatch')
		expect(error.name).toBe('ContentTypeMismatchError')
	})

	test('should have correct message', () => {
		const message = 'Item is a podcast, not a book'
		const error = new ContentTypeMismatchError(message)
		expect(error.message).toBe(message)
	})

	test('should be an instance of Error', () => {
		const error = new ContentTypeMismatchError('Content type mismatch')
		expect(error).toBeInstanceOf(Error)
	})

	test('should have a stack trace', () => {
		const error = new ContentTypeMismatchError('Content type mismatch')
		expect(error.stack).toBeDefined()
	})

	test('should accept optional details parameter', () => {
		const details = {
			asin: 'B12345',
			requestedType: 'book',
			actualType: 'PodcastParent'
		}
		const error = new ContentTypeMismatchError('Item is a podcast, not a book', details)
		expect(error.details).toEqual(details)
	})

	test('should have undefined details when not provided', () => {
		const error = new ContentTypeMismatchError('Content type mismatch')
		expect(error.details).toBeUndefined()
	})

	test('can be caught as Error', () => {
		try {
			throw new ContentTypeMismatchError('Content type mismatch')
		} catch (err) {
			expect(err).toBeInstanceOf(Error)
			expect(err).toBeInstanceOf(ContentTypeMismatchError)
		}
	})
})

describe('ValidationError', () => {
	test('should have statusCode 422', () => {
		const error = new ValidationError('Validation failed')
		expect(error.statusCode).toBe(422)
	})

	test('should have correct name', () => {
		const error = new ValidationError('Validation failed')
		expect(error.name).toBe('ValidationError')
	})

	test('should have correct message', () => {
		const message = 'Missing required field: author'
		const error = new ValidationError(message)
		expect(error.message).toBe(message)
	})

	test('should be an instance of Error', () => {
		const error = new ValidationError('Validation failed')
		expect(error).toBeInstanceOf(Error)
	})

	test('should have a stack trace', () => {
		const error = new ValidationError('Validation failed')
		expect(error.stack).toBeDefined()
	})

	test('should accept optional details parameter', () => {
		const details = { field: 'author', reason: 'required' }
		const error = new ValidationError('Missing required field', details)
		expect(error.details).toEqual(details)
	})

	test('should have undefined details when not provided', () => {
		const error = new ValidationError('Validation failed')
		expect(error.details).toBeUndefined()
	})

	test('can be caught as Error', () => {
		try {
			throw new ValidationError('Validation failed')
		} catch (err) {
			expect(err).toBeInstanceOf(Error)
			expect(err).toBeInstanceOf(ValidationError)
		}
	})
})

describe('Error classes fallback stack trace', () => {
	test('NotFoundError uses fallback stack trace when captureStackTrace unavailable', () => {
		const originalCaptureStackTrace = Error.captureStackTrace
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(Error as any).captureStackTrace = undefined
			const error = new NotFoundError('Test message')
			expect(error.stack).toBeDefined()
		} finally {
			Error.captureStackTrace = originalCaptureStackTrace
		}
	})

	test('BadRequestError uses fallback stack trace when captureStackTrace unavailable', () => {
		const originalCaptureStackTrace = Error.captureStackTrace
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(Error as any).captureStackTrace = undefined
			const error = new BadRequestError('Test message')
			expect(error.stack).toBeDefined()
		} finally {
			Error.captureStackTrace = originalCaptureStackTrace
		}
	})

	test('ContentTypeMismatchError uses fallback stack trace when captureStackTrace unavailable', () => {
		const originalCaptureStackTrace = Error.captureStackTrace
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(Error as any).captureStackTrace = undefined
			const error = new ContentTypeMismatchError('Test message')
			expect(error.stack).toBeDefined()
		} finally {
			Error.captureStackTrace = originalCaptureStackTrace
		}
	})

	test('ValidationError uses fallback stack trace when captureStackTrace unavailable', () => {
		const originalCaptureStackTrace = Error.captureStackTrace
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(Error as any).captureStackTrace = undefined
			const error = new ValidationError('Test message')
			expect(error.stack).toBeDefined()
		} finally {
			Error.captureStackTrace = originalCaptureStackTrace
		}
	})
})
