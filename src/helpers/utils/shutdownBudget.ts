/** Aggregate wall-clock budget for every close in one shutdown. The API
 * charges its HTTP drain, queue/Redis closes, and rate-limit quit against it
 * (src/server.ts startShutdownBudget); the worker charges its BullMQ close
 * and queue closes (src/worker.ts). The closes run sequentially, so each is
 * bounded by the REMAINING budget: the sum of the per-close deadlines is at
 * most this value, no matter how many clients are owned. It must fit the
 * supported deployment (the 10s Docker/Swarm default stop grace) together
 * with the UNBUDGETED Mongo close that follows it, so the Mongo close is
 * always REACHED before the grace — its own duration is not budgeted. */
export const SHUTDOWN_REDIS_BUDGET_MS = 9000

/** Resolve when `close` settles, or after `timeoutMs` with `fallback` run —
 * whichever comes first. The timer is always cleared. A hung close (an
 * offline-blocked client) is force-cleaned on the deadline; a close that
 * settles in time wins. By default a close rejection is swallowed (the Redis
 * client quits never meaningfully reject on shutdown). Pass
 * `propagateRejection` (worker BullMQ close) so a genuine close failure
 * aborts the remaining teardown instead of silently proceeding. Shared with
 * the rate-limit client close in src/server.ts. */
export function closeWithTimeout(
	close: () => Promise<unknown>,
	fallback: () => void,
	label: string,
	timeoutMs: number,
	options: { propagateRejection?: boolean } = {}
): Promise<void> {
	let settledByDeadline = false
	let timer!: NodeJS.Timeout
	const deadline = new Promise<void>((resolve) => {
		timer = setTimeout(() => {
			settledByDeadline = true
			console.warn(`${label} did not close in ${timeoutMs}ms; forcing disconnect`)
			fallback()
			resolve()
		}, timeoutMs)
	})
	// A close that rejects after the deadline already won the race must not
	// surface as an unhandled rejection; swallow it, and the race outcome is
	// unchanged. A pre-deadline rejection propagates only when asked to.
	// Invoke `close` lazily (deferred) and discard its return value so the
	// candidate is Promise<void>; the deadline is the race's void side.
	const candidate = Promise.resolve()
		.then(async () => {
			await close()
		})
		.catch((err: unknown) => {
			if (settledByDeadline || !options.propagateRejection) return undefined
			throw err
		})
	return Promise.race([candidate, deadline]).finally(() => {
		clearTimeout(timer)
	})
}

/** Aggregate wall-clock deadline for the whole shutdown, not per close.
 * `closeQueue` draws its three per-close deadlines from it, and the API's
 * rate-limit close draws from the remainder (`stopServer` in src/server.ts),
 * so sequential per-close deadlines cannot multiply past it and push the
 * Mongo close past the 10s Docker stop grace. */
let shutdownBudgetDeadline = 0

export function startShutdownBudget(budgetMs: number = SHUTDOWN_REDIS_BUDGET_MS): void {
	shutdownBudgetDeadline = Date.now() + budgetMs
}

/** Remaining aggregate budget (min 1ms so a deadline always exists); 0 when
 * no shutdown budget has been started, meaning the caller bounds the close
 * with its own per-close deadline. */
export function remainingShutdownBudget(): number {
	return shutdownBudgetDeadline ? Math.max(1, shutdownBudgetDeadline - Date.now()) : 0
}

/** True when no shutdown budget is active. A never-started budget and an
 * expired one are the same state: a fresh budget must start. A budget with
 * a sub-millisecond remnant is still active (it keeps its 1 ms floor), so
 * this is not `remainingShutdownBudget() === 0`; it is the caller's
 * "start a fresh budget" trigger. */
export function isShutdownBudgetExpired(): boolean {
	return shutdownBudgetDeadline <= Date.now()
}
