// Shared validation guards for the read-only history and artwork routes.
// The ASIN and cursor checks are identical in every route; centralizing
// them keeps the cursor 400 mapping in lockstep (cursor identity/filter
// mismatches are client input, never server 500s).

import { AsinSchema } from '#config/types'
import { InvalidCursorError } from '#helpers/books/historyCursor'
import { BadRequestError } from '#helpers/errors/ApiErrors'
import { MessageBadAsin } from '#static/messages'

/**
 * Validate the `:asin` path parameter; throws a 400 `BadRequestError` when
 * it is not a well-formed ASIN. Returns the parsed (trimmed) value —
 * `AsinSchema` normalizes surrounding whitespace, and downstream filters
 * and state keys use the value verbatim.
 */
export function requireValidAsin(asinParam: string): string {
	const parsed = AsinSchema.safeParse(asinParam)
	if (!parsed.success) {
		throw new BadRequestError(MessageBadAsin)
	}
	return parsed.data
}

/**
 * Wrap a helper call and map decode-side cursor-validation failures to a
 * 400 `BadRequestError`. Only `InvalidCursorError` — thrown by the decode
 * paths for malformed, non-canonical, oversized, and unbound cursors —
 * is client input. Encode-side `Invalid cursor value` failures (server
 * state, e.g. a corrupted watermark) propagate as 500s.
 */
export async function guardCursorErrors<T>(action: () => Promise<T>): Promise<T> {
	try {
		return await action()
	} catch (error) {
		if (error instanceof InvalidCursorError) {
			throw new BadRequestError(`Invalid cursor: ${error.message}`)
		}
		throw error
	}
}
