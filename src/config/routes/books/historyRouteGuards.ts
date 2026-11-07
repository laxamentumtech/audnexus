// Shared validation guards for the read-only history and artwork routes.
// The ASIN and cursor checks are identical in every route; centralizing
// them keeps the cursor 400 mapping in lockstep (cursor identity/filter
// mismatches are client input, never server 500s).

import { AsinSchema } from '#config/types'
import { BadRequestError } from '#helpers/errors/ApiErrors'
import { MessageBadAsin } from '#static/messages'

/**
 * Validate the `:asin` path parameter; throws a 400 `BadRequestError` when
 * it is not a well-formed ASIN. Returns the parsed value unchanged.
 */
export function requireValidAsin(asinParam: string): string {
	if (!AsinSchema.safeParse(asinParam).success) {
		throw new BadRequestError(MessageBadAsin)
	}
	return asinParam
}

/**
 * Wrap a helper call and map every cursor-validation failure to a 400
 * `BadRequestError`. `decodeCursor` throws plain `Error`s for any of
 * `Invalid cursor ...` (malformed, non-canonical, oversized, unbound) and
 * `Cursor does not match book|filter` (identity or field-filter reuse);
 * all of them are client input errors.
 */
export async function guardCursorErrors<T>(action: () => Promise<T>): Promise<T> {
	try {
		return await action()
	} catch (error) {
		if (error instanceof Error && /^(Invalid cursor|Cursor does not match)/.test(error.message)) {
			throw new BadRequestError(`Invalid cursor: ${error.message}`)
		}
		throw error
	}
}
