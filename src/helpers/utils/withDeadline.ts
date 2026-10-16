/**
 * Error thrown by withDeadline when the underlying promise does not settle
 * within the deadline. Carries the caller-provided label so logs point at the
 * exact item that hung.
 */
export class DeadlineExceededError extends Error {
	constructor(label: string, timeoutMs: number, options?: { cause?: unknown }) {
		super(`Deadline exceeded after ${timeoutMs}ms: ${label}`, options)
		this.name = 'DeadlineExceededError'
	}
}

/**
 * Race a promise against a hard deadline. If the deadline elapses first, the
 * returned promise rejects with a DeadlineExceededError naming the label.
 *
 * JavaScript promises cannot be cancelled: the underlying work keeps running
 * and may settle (or reject) later. A late rejection is observed and
 * discarded so it can never surface as an unhandled rejection — the caller
 * has already moved on. The point is containment: an await that would hang
 * forever (e.g. a pooled keep-alive socket that never settles) instead
 * surfaces as a normal error the surrounding loop can catch, log, and count
 * as a failure, keeping the consuming loop alive.
 */
export async function withDeadline<T>(
	underlying: Promise<T>,
	timeoutMs: number,
	label: string
): Promise<T> {
	// 0 disables the guard (documented SCHEDULER_ITEM_TIMEOUT_MS contract):
	// return the underlying untouched — no timer, no race.
	if (timeoutMs <= 0) {
		underlying.catch(() => undefined)
		return underlying
	}

	// Observe the underlying so a late rejection cannot become unhandled.

	underlying.catch(() => undefined)

	let timer: NodeJS.Timeout
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new DeadlineExceededError(label, timeoutMs)), timeoutMs)
	})

	return Promise.race([underlying, deadline]).finally(() => clearTimeout(timer))
}
