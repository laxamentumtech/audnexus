import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

import type { PerformanceConfig } from '#config/performance'
import { resetPerformanceConfig, setPerformanceConfig } from '#config/performance'

const sleepMock = mock()

mock.module('#helpers/utils/sleep', () => ({ default: sleepMock }))

import { jitteredSleep } from '#helpers/utils/jitteredSleep'

const makeConfig = (jitter: { min: number; max: number }): PerformanceConfig => ({
	USE_PARALLEL_SCHEDULER: false,
	USE_CONNECTION_POOLING: true,
	USE_COMPACT_JSON: true,
	USE_SORTED_KEYS: false,
	CIRCUIT_BREAKER_ENABLED: true,
	METRICS_ENABLED: false,
	MAX_CONCURRENT_REQUESTS: 50,
	SCHEDULER_CONCURRENCY: 5,
	SCHEDULER_MAX_PER_REGION: 5,
	SCHEDULER_BATCH_SIZE: 1000,
	JITTER_MS: jitter,
	DEFAULT_REGION: 'us'
})

beforeEach(() => {
	resetPerformanceConfig()
	sleepMock.mockClear()
})

describe('jitteredSleep should', () => {
	it('sleep the minimum delay when random is 0', async () => {
		const randomSpy = spyOn(Math, 'random').mockReturnValue(0)
		setPerformanceConfig(makeConfig({ min: 1000, max: 3000 }))
		await jitteredSleep()
		expect(sleepMock).toHaveBeenCalledWith(1000)
		randomSpy.mockRestore()
	})

	it('sleep near the maximum delay when random is just under 1', async () => {
		const randomSpy = spyOn(Math, 'random').mockReturnValue(0.999)
		setPerformanceConfig(makeConfig({ min: 1000, max: 3000 }))
		await jitteredSleep()
		// Math.floor(1000 + 0.999 * 2001) = Math.floor(2998.999) = 2998
		expect(sleepMock).toHaveBeenCalledWith(2998)
		randomSpy.mockRestore()
	})

	it('sleep the midpoint of the default 0-5000 range at random 0.5', async () => {
		const randomSpy = spyOn(Math, 'random').mockReturnValue(0.5)
		setPerformanceConfig(makeConfig({ min: 0, max: 5000 }))
		await jitteredSleep()
		expect(sleepMock).toHaveBeenCalledWith(2500)
		randomSpy.mockRestore()
	})
})
