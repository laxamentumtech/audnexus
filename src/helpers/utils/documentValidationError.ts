/** True when a write was rejected by MongoDB's document validator. Papr wraps
 * driver errors in `ErrorMessageUpdate`, so the code/message lives on the cause
 * chain; the depth-4 walk stays inside that wrapper. Used by the persistence
 * path (history mode) and the ratings backfill (both modes) to route a
 * validator rejection to the fenced ratings repair instead of a failure. */
export function isDocumentValidationError(error: unknown): boolean {
	let current: unknown = error
	for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
		const candidate = current as { code?: unknown; message?: unknown; cause?: unknown }
		if (candidate.code === 121) return true
		if (
			typeof candidate.message === 'string' &&
			candidate.message.includes('Document failed validation')
		) {
			return true
		}
		current = candidate.cause
	}
	return false
}
