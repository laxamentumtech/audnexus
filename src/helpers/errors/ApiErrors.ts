// Custom error classes for API responses with HTTP status codes

/**
 * Error thrown when a requested resource is not found (HTTP 404)
 */
export class NotFoundError extends Error {
	readonly statusCode: number

	constructor(message: string) {
		super(message)
		this.name = 'NotFoundError'
		this.statusCode = 404
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

	constructor(message: string) {
		super(message)
		this.name = 'BadRequestError'
		this.statusCode = 400
		// Maintains proper stack trace for where error was thrown
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, BadRequestError)
		} else {
			this.stack = new Error(message).stack
		}
	}
}
