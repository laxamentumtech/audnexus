import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import {
	BadRequestError,
	ConflictError,
	ContentTypeMismatchError,
	NotFoundError,
	ValidationError
} from '#helpers/errors/ApiErrors'

/**
 * The API's structured error envelope, shared by the production server and
 * real-HTTP verification so invalid inputs use the same shape in both.
 * Typed errors map to their fixed codes; rate-limit (429) and generic
 * status-bearing errors fall through to the documented defaults.
 */
export function registerApiErrorHandler(fastify: FastifyInstance): void {
	// Check for custom error status codes (404, 400, etc.)
	fastify.setErrorHandler(function (
		error: FastifyError,
		request: FastifyRequest,
		reply: FastifyReply
	) {
		const errorCodeMap: Record<string, string> = {
			ContentTypeMismatchError: 'CONTENT_TYPE_MISMATCH',
			ValidationError: 'VALIDATION_ERROR',
			NotFoundError: 'NOT_FOUND',
			BadRequestError: 'BAD_REQUEST',
			ConflictError: 'CONFLICT'
		}

		if (
			error instanceof ContentTypeMismatchError ||
			error instanceof ValidationError ||
			error instanceof NotFoundError ||
			error instanceof BadRequestError ||
			error instanceof ConflictError
		) {
			const statusCode = error.statusCode
			const errorCode = error.details?.code || errorCodeMap[error.name] || 'UNKNOWN_ERROR'

			reply.status(statusCode)
			reply.send({
				error: {
					code: errorCode,
					message: error.message,
					details: error.details
				}
			})
			return
		}

		// Check for 429 rate limit errors first
		if (reply.statusCode === 429) {
			if (error instanceof Error) {
				reply.status(429)
				reply.send({
					error: {
						code: 'RATE_LIMIT_EXCEEDED',
						message: 'Rate limit reached. Please try again later.',
						details: null
					}
				})
				return
			} else {
				fastify.log.error('Non-error object in error handler: %s', String(error))
			}
		}

		// Check if error has a custom statusCode property
		if (error instanceof Error && 'statusCode' in error) {
			const statusCode = (error as Error & { statusCode: number }).statusCode
			const errorCode = String(statusCode || 'UNKNOWN_ERROR')
			reply.status(statusCode)
			reply.send({
				error: {
					code: errorCode,
					message: error.message || 'An error occurred',
					details: null
				}
			})
			return
		}
		reply.send(error)
	})
}
