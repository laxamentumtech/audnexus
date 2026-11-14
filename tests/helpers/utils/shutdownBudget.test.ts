import { describe, expect, test } from 'bun:test'

import {
	closeWithTimeout,
	isShutdownBudgetExpired,
	remainingShutdownBudget,
	SHUTDOWN_REDIS_BUDGET_MS,
	startShutdownBudget
} from '#helpers/utils/shutdownBudget'

// Real wall-clock timers are deliberate: these deadlines are real platform
// clocks, and Bun fake-timer interop deadlocks the race (the same
// convention as the closeWithTimeout tests in
// tests/helpers/jobs/bullmq.test.ts and the real-HTTP drain tests in
// tests/helpers/utils/httpShutdown.test.ts).

describe('shutdown budget boundaries', () => {
	test('reports 0 remaining while no budget has been started', () => {
		// Must run before any budget starts in this file: the module state
		// is process-wide for the test file and there is no reset — the
		// never-started state is a zero deadline, which an expired budget
		// (startShutdownBudget(0)) is NOT (it keeps its 1 ms floor).
		expect(remainingShutdownBudget()).toBe(0)
		expect(isShutdownBudgetExpired()).toBe(true)
	})

	test('a 0 ms budget is immediately expired and floored at 1 ms', () => {
		// startShutdownBudget(0) is the exhausted-budget state: an expired
		// budget and a never-started one are the same state for the
		// "start a fresh budget" trigger (isShutdownBudgetExpired), while
		// remainingShutdownBudget keeps the 1 ms floor so a deadline always
		// exists for closeWithTimeout — it never reads 0 once started.
		startShutdownBudget(0)
		expect(isShutdownBudgetExpired()).toBe(true)
		expect(remainingShutdownBudget()).toBe(1)
	})

	test('an active budget counts down, then expires to the 1 ms floor', async () => {
		startShutdownBudget(200)
		expect(isShutdownBudgetExpired()).toBe(false)
		expect(remainingShutdownBudget()).toBeGreaterThan(0)
		expect(remainingShutdownBudget()).toBeLessThanOrEqual(200)
		await new Promise((resolve) => setTimeout(resolve, 250))
		expect(isShutdownBudgetExpired()).toBe(true)
		// The expired budget is floored, not negative/zero: a per-close
		// deadline drawn from it must always exist.
		expect(remainingShutdownBudget()).toBe(1)
	})

	test('keeps the default aggregate budget within the 10s Docker stop grace', () => {
		// The budget is the whole close phase; it must stay under the
		// default 10s stop grace so the unbudgeted Mongo close that follows
		// is reached before SIGKILL. Pin the relationship, not a magic
		// value (mirrors the bullmq test).
		expect(SHUTDOWN_REDIS_BUDGET_MS).toBeLessThan(10_000)
		expect(SHUTDOWN_REDIS_BUDGET_MS).toBeGreaterThan(0)
	})
})

describe('closeWithTimeout', () => {
	test('a rejection after the 1 ms deadline resolves, runs the fallback, and surfaces no unhandledRejection', async () => {
		// The worker BullMQ close contract (propagateRejection): a HUNG
		// close is force-cleaned on the deadline and teardown continues,
		// and a rejection that lands AFTER the deadline has already won
		// the race must be swallowed — surfacing it as an
		// unhandledRejection would kill a process mid-shutdown.
		const unhandled: unknown[] = []
		const onUnhandled = (reason: unknown) => {
			unhandled.push(reason)
		}
		process.on('unhandledRejection', onUnhandled)
		try {
			let fallbackCount = 0
			const fallback = () => {
				fallbackCount += 1
			}
			const close = () =>
				new Promise<never>((_, reject) => {
					setTimeout(() => reject(new Error('late close failure')), 40)
				})
			const started = Date.now()
			await expect(
				closeWithTimeout(close, fallback, 'slow close', 1, { propagateRejection: true })
			).resolves.toBeUndefined()
			expect(fallbackCount).toBe(1)
			// The deadline won, not the (later) rejection: bounded.
			expect(Date.now() - started).toBeLessThan(1000)
			// The late rejection landed well after the deadline; it must
			// not surface as an unhandled rejection.
			await new Promise((resolve) => setTimeout(resolve, 100))
			expect(unhandled).toEqual([])
		} finally {
			process.off('unhandledRejection', onUnhandled)
		}
	})

	test('a pre-deadline rejection propagates only with propagateRejection', async () => {
		// The worker shutdown relies on this contract: a genuine close
		// FAILURE must abort the remaining teardown, while the default
		// swallows it (Redis quits never meaningfully reject on
		// shutdown). Mirrors the bullmq test of the same name.
		const fail = new Error('real close failed')
		const fallback = () => {
			fallbackCount += 1
		}
		let fallbackCount = 0
		await expect(
			closeWithTimeout(() => Promise.reject(fail), fallback, 'real close', 5000, {
				propagateRejection: true
			})
		).rejects.toBe(fail)
		expect(fallbackCount).toBe(0)
		await closeWithTimeout(() => Promise.reject(fail), fallback, 'real close', 5000)
		expect(fallbackCount).toBe(0)
	})

	test('a close that settles in time wins the race, no fallback', async () => {
		const fallback = () => {
			fallbackCount += 1
		}
		let fallbackCount = 0
		await expect(closeWithTimeout(() => Promise.resolve(), fallback, 'fast close', 500)).resolves.toBeUndefined()
		expect(fallbackCount).toBe(0)
	})
})
