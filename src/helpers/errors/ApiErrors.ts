// Custom error classes for API responses with HTTP status codes

/**
 * Error details interface for additional context about the error
 */
export interface ErrorDetails {
	asin?: string
	requestedType?: string
	actualType?: string
	[field: string]: unknown
}

/**
 * Error thrown when a requested resource is not found (HTTP 404)
 */
export class NotFoundError extends Error {
	readonly statusCode: number
	readonly details?: ErrorDetails

	constructor(message: string, details?: ErrorDetails) {
		super(message)
		this.name = 'NotFoundError'
		this.statusCode = 404
		this.details = details
		// Maintains proper stack trace for where error was thrown
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, NotFoundError)
		} else {
			this.stack = new Error(message).stack
		}
	}
}

/**
 * Error thrown when the request is invalid (HTTP 400)
 */
export class BadRequestError extends Error {
	readonly statusCode: number
	readonly details?: ErrorDetails

	constructor(message: string, details?: ErrorDetails) {
		super(message)
		this.name = 'BadRequestError'
		this.statusCode = 400
		this.details = details
		// Maintains proper stack trace for where error was thrown
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, BadRequestError)
		} else {
			this.stack = new Error(message).stack
		}
	}
}

/**
 * Error thrown when the content type of a response does not match the expected type (HTTP 400)
 */
export class ContentTypeMismatchError extends Error {
	readonly statusCode: number
	readonly details?: ErrorDetails

	constructor(message: string, details?: ErrorDetails) {
		super(message)
		this.name = 'ContentTypeMismatchError'
		this.statusCode = 400
		this.details = details
		// Maintains proper stack trace for where error was thrown
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, ContentTypeMismatchError)
		} else {
			this.stack = new Error(message).stack
		}
	}
}

/**
 * Error thrown when the request fails validation (HTTP 422)
 */
export class ValidationError extends Error {
	readonly statusCode: number
	readonly details?: ErrorDetails

	constructor(message: string, details?: ErrorDetails) {
		super(message)
		this.name = 'ValidationError'
		this.statusCode = 422
		this.details = details
		// Maintains proper stack trace for where error was thrown
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, ValidationError)
		} else {
			this.stack = new Error(message).stack
		}
	}
}
