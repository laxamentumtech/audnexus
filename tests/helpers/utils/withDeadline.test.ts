import { describe, expect, test } from 'bun:test'

import { DeadlineExceededError, withDeadline } from '#helpers/utils/withDeadline'

// Real timers are deliberate here: withDeadline's contract is wall-clock
// deadline semantics, and bun's fake-timer interop deadlocked the test
// runner when driving the util's internal setTimeout (runner-wide hang).
// Deadlines are 20-30ms, so each test costs milliseconds.

describe('withDeadline', () => {
	test('resolves with the underlying value when it settles in time', async () => {
		const result = await withDeadline(Promise.resolve('ok'), 1000, 'label')
		expect(result).toBe('ok')
	})

	test('passes through rejection when the underlying fails in time', async () => {
		const { promise, reject } = Promise.withResolvers<never>()
		reject(new Error('boom'))
		await expect(withDeadline(promise, 1000, 'label')).rejects.toThrow('boom')
	})

	test('rejects with DeadlineExceededError when the underlying never settles', async () => {
		const { promise: never } = Promise.withResolvers<string>()
		await expect(withDeadline(never, 25, 'author B000TEST')).rejects.toThrow(
			DeadlineExceededError
		)
	})

	test('deadline error names the label and timeout', async () => {
		const { promise: never } = Promise.withResolvers<string>()
		const error = await withDeadline(never, 25, 'author B000TEST').then(
			() => undefined,
			(e: unknown) => e
		)
		expect(error).toBeInstanceOf(DeadlineExceededError)
		expect((error as Error).message).toContain('author B000TEST')
		expect((error as Error).message).toContain('25ms')
	})

	test('a late rejection after the deadline is discarded, not unhandled', async () => {
		const { promise: underlying, reject } = Promise.withResolvers<string>()
		const raced = withDeadline(underlying, 25, 'label')
		await expect(raced).rejects.toThrow(DeadlineExceededError)
		// The underlying rejects after the race settled; withDeadline must
		// have attached a catch so this cannot surface as unhandled.
		reject(new Error('late rejection'))
		// Flush microtasks twice so the swallowed rejection is observed.
		await Promise.resolve()
		await Promise.resolve()
	})
})
