import { afterEach, describe, expect, test } from 'bun:test'

import {
	getCooldownMs,
	getConsecutiveRateLimited,
	registerRateLimited,
	registerSuccess,
	resetCooldown,
	sleepCooldown,
	setCooldownLogger
} from '#helpers/utils/adaptiveCooldown'

// The singleton is process-global; every test starts from a clean slate.
afterEach(() => {
	resetCooldown()
})

describe('adaptiveCooldown', () => {
	test('starts with no cooldown and no pressure', () => {
		expect(getCooldownMs()).toBe(0)
		expect(getConsecutiveRateLimited()).toBe(0)
	})

	test('first rate limit raises cooldown to the 2m base', () => {
		const cooldown = registerRateLimited()
		expect(cooldown).toBe(120_000)
		expect(getCooldownMs()).toBe(120_000)
		expect(getConsecutiveRateLimited()).toBe(1)
	})

	test('consecutive rate limits double the cooldown up to the 2h cap', () => {
		expect(registerRateLimited()).toBe(120_000)
		expect(registerRateLimited()).toBe(240_000)
		expect(registerRateLimited()).toBe(480_000)
		expect(registerRateLimited()).toBe(960_000)
		// Steps 1-6 are 120k..3.84M, all under the 7.2M ceiling; the clamp
		// first binds at step 7 (7.68M → 7.2M) and stays pinned after.
		expect(registerRateLimited()).toBe(1_920_000)
		expect(registerRateLimited()).toBe(3_840_000)
		expect(registerRateLimited()).toBe(7_200_000)
		expect(registerRateLimited()).toBe(7_200_000)
	})

	test('Retry-After hint larger than the ladder raises the cooldown', () => {
		const cooldown = registerRateLimited(120_000)
		expect(cooldown).toBe(120_000)
	})

	test('Retry-After hint smaller than the ladder is ignored', () => {
		const cooldown = registerRateLimited(5_000)
		expect(cooldown).toBe(120_000)
	})

	test('success halves the cooldown and resets the ladder position', () => {
		registerRateLimited()
		registerRateLimited()
		expect(registerRateLimited()).toBe(480_000)
		expect(registerSuccess()).toBe(240_000)
		// Ladder restarts from base after the counter reset — not 240s.
		expect(registerRateLimited()).toBe(120_000)
	})

	test('repeated successes decay to zero', () => {
		registerRateLimited()
		registerRateLimited()
		// Two 503s → 240_000; first success halves it to 120_000.
		expect(registerSuccess()).toBe(120_000)
		expect(registerSuccess()).toBe(60_000)
		expect(registerSuccess()).toBe(30_000)
		// Each further success halves again toward zero.
		expect(registerSuccess()).toBe(15_000)
		expect(registerSuccess()).toBe(7_500)
		expect(registerSuccess()).toBe(3_750)
		expect(registerSuccess()).toBe(1_875)
		expect(registerSuccess()).toBe(937)
		expect(registerSuccess()).toBe(468)
		expect(registerSuccess()).toBe(234)
		expect(registerSuccess()).toBe(117)
		expect(registerSuccess()).toBe(58)
		expect(registerSuccess()).toBe(29)
		expect(registerSuccess()).toBe(14)
		expect(registerSuccess()).toBe(7)
		expect(registerSuccess()).toBe(3)
		expect(registerSuccess()).toBe(1)
		expect(registerSuccess()).toBe(0)
	})

	test('sleepCooldown resolves immediately with no pressure', async () => {
		const start = Date.now()
		await sleepCooldown()
		expect(Date.now() - start).toBeLessThan(50)
	})

	test('notifier fires when the cooldown grows', () => {
		const messages: string[] = []
		setCooldownLogger((message) => messages.push(message))
		registerRateLimited()
		expect(messages).toHaveLength(1)
		expect(messages[0]).toContain('120s')
	})

	test('notifier is cleared by resetCooldown', () => {
		const messages: string[] = []
		setCooldownLogger((message) => messages.push(message))
		resetCooldown()
		registerRateLimited()
		expect(messages).toHaveLength(0)
	})
})
