import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import { createMockLogger } from '#tests/setup/mockLogger'

const mockUpsert = mock()

mock.module('#helpers/jobs/bullmq', () => ({
	upsertUpdateScheduler: mockUpsert
}))

import { registerUpdateScheduler } from '#helpers/jobs/schedule'
import { TEST_REDIS_URL } from '#tests/setup/performanceConfig'

let savedRedisUrl: string | undefined

beforeEach(() => {
	savedRedisUrl = process.env.REDIS_URL
	delete process.env.REDIS_URL
})

afterEach(() => {
	if (savedRedisUrl === undefined) {
		delete process.env.REDIS_URL
	} else {
		process.env.REDIS_URL = savedRedisUrl
	}
})

describe('registerUpdateScheduler should', () => {
	it('disable scheduling with a warning when REDIS_URL is missing', async () => {
		const log = createMockLogger()
		await registerUpdateScheduler(30, log)
		expect(log.warn).toHaveBeenCalledWith(
			'REDIS_URL not set; scheduled updates and backfill enqueue disabled'
		)
		expect(mockUpsert).not.toHaveBeenCalled()
	})

	it('upsert the repeatable scheduler when REDIS_URL is set', async () => {
		const log = createMockLogger()
		process.env.REDIS_URL = TEST_REDIS_URL
		mockUpsert.mockResolvedValueOnce(undefined)
		await registerUpdateScheduler(30, log)
		expect(mockUpsert).toHaveBeenCalledWith(30)
		expect(log.info).toHaveBeenCalledWith('Update scheduler enqueued: every 30 days')
	})

	it('log and swallow scheduler registration failures', async () => {
		const log = createMockLogger()
		process.env.REDIS_URL = TEST_REDIS_URL
		mockUpsert.mockRejectedValueOnce(new Error('redis down'))
		await expect(registerUpdateScheduler(30, log)).resolves.toBeUndefined()
		expect(log.error).toHaveBeenCalledWith(
			new Error('redis down'),
			'Failed to register update scheduler; scheduled updates disabled'
		)
	})
})
