import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'

const mockGet = mock()

mock.module('#helpers/utils/connectionPool', () => {
	return { default: { get: mockGet } }
})

const sleepDelays: number[] = []
mock.module('#helpers/utils/sleep', () => {
	return {
		default: (ms: number) => {
			sleepDelays.push(ms)
			return Promise.resolve()
		}
	}
})

import type { AxiosResponse } from 'axios'

import {
	getConsecutiveRateLimited,
	getCooldownMs,
	resetCooldown
} from '#helpers/utils/adaptiveCooldown'
import pooledAxios from '#helpers/utils/connectionPool'
import fetchPlus from '#helpers/utils/fetchPlus'

let mockStatus: { status: number; headers?: Record<string, string> }

describe('fetchPlus should', () => {
	beforeEach(() => {
		sleepDelays.length = 0
		mockGet.mockClear()
	})

	afterEach(() => {
		mock.restore()
		resetCooldown()
	})

	test('return response', async () => {
		const mockResponse = { data: 'test', status: 200 } as AxiosResponse
		mockGet.mockImplementation(() => Promise.resolve(mockResponse))
		const response = await fetchPlus('test')
		expect(response).toEqual(mockResponse)
	})

	test('return error with default retries', async () => {
		mockStatus = { status: 500 }
		mockGet.mockImplementation(() => {
			const error: Error & { response: typeof mockStatus } = Object.assign(
				new Error('Request failed'),
				{ response: mockStatus }
			)
			return Promise.reject(error)
		})

		await expect(fetchPlus('test.com')).rejects.toEqual(mockStatus)
		expect(pooledAxios.get).toHaveBeenCalledTimes(4)
	})

	test('retry on non-200', async () => {
		mockStatus = { status: 200 }
		mockGet
			.mockRejectedValueOnce({ status: 500 })
			.mockResolvedValueOnce(mockStatus as AxiosResponse)
		await expect(fetchPlus('test.com')).resolves.toEqual(mockStatus)
	})

	test('retry the correct number of times before hard failing', async () => {
		mockStatus = { status: 500 }
		mockGet.mockImplementation(() => {
			const error: Error & { response: typeof mockStatus } = Object.assign(
				new Error('Request failed'),
				{ response: mockStatus }
			)
			return Promise.reject(error)
		})

		await expect(fetchPlus('test.com', {}, 2)).rejects.toEqual(mockStatus)
		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
	})

	test('retry with exponential backoff on 429 without Retry-After header', async () => {
		const mockError = {
			response: {
				status: 429,
				headers: {}
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		mockGet.mockRejectedValueOnce(mockError).mockResolvedValueOnce(successResponse)

		const response = await fetchPlus('test.com')
		expect(response).toEqual(successResponse)
		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
		expect(sleepDelays).toEqual([1000])
	})

	test('retry with Retry-After header on 429', async () => {
		const mockError = {
			response: {
				status: 429,
				headers: { 'retry-after': '2' }
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		mockGet.mockRejectedValueOnce(mockError).mockResolvedValueOnce(successResponse)

		const response = await fetchPlus('test.com')

		expect(response).toEqual(successResponse)
		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
		expect(sleepDelays).toEqual([2000])
	})

	test('retry with increasing exponential backoff on multiple 429s', async () => {
		const mockError = {
			response: {
				status: 429,
				headers: {}
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		mockGet
			.mockRejectedValueOnce(mockError)
			.mockRejectedValueOnce(mockError)
			.mockResolvedValueOnce(successResponse)

		const response = await fetchPlus('test.com')

		expect(response).toEqual(successResponse)
		expect(pooledAxios.get).toHaveBeenCalledTimes(3)
		expect(sleepDelays).toEqual([1000, 2000])
	})

	test('retry with exponential backoff on 429 with headers missing retry-after key', async () => {
		const mockError = {
			response: {
				status: 429,
				headers: { 'x-custom-header': 'value' }
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		mockGet.mockRejectedValueOnce(mockError).mockResolvedValueOnce(successResponse)

		const response = await fetchPlus('test.com')

		expect(response).toEqual(successResponse)
		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
		expect(sleepDelays).toEqual([1000])
	})

	test('retry with exponential backoff on 503', async () => {
		const mockError = {
			response: {
				status: 503,
				headers: {}
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		mockGet.mockRejectedValueOnce(mockError).mockResolvedValueOnce(successResponse)

		// Mock Math.random to 0.5 → jitter = floor(0.5 * 250) = 125
		const randomSpy = spyOn(Math, 'random').mockReturnValue(0.5)
		try {
			const response = await fetchPlus('test.com')
			expect(response).toEqual(successResponse)
			expect(pooledAxios.get).toHaveBeenCalledTimes(2)
			expect(sleepDelays).toEqual([1125])
		} finally {
			randomSpy.mockRestore()
		}
	})

	test('retry with exponential backoff on 504', async () => {
		const mockError = {
			response: {
				status: 504,
				headers: {}
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		mockGet.mockRejectedValueOnce(mockError).mockResolvedValueOnce(successResponse)

		const randomSpy = spyOn(Math, 'random').mockReturnValue(0.5)
		try {
			const response = await fetchPlus('test.com')
			expect(response).toEqual(successResponse)
			expect(pooledAxios.get).toHaveBeenCalledTimes(2)
			expect(sleepDelays).toEqual([1125])
		} finally {
			randomSpy.mockRestore()
		}
	})

	test('honor Retry-After header on 503', async () => {
		const mockError = {
			response: {
				status: 503,
				headers: { 'retry-after': '10' }
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		mockGet.mockRejectedValueOnce(mockError).mockResolvedValueOnce(successResponse)

		// Retry-After is honored for all rate-limit statuses (Audible
		// throttles with 503), clamped to the 8s retry-delay ceiling.
		// Math.random → 0 zeroes the 503/504 retry jitter.
		const randomSpy = spyOn(Math, 'random').mockReturnValue(0)
		try {
			await fetchPlus('test.com')
		} finally {
			randomSpy.mockRestore()
		}

		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
		expect(sleepDelays).toEqual([8_000])
	})

	test('honor Retry-After header on 504', async () => {
		const mockError = {
			response: {
				status: 504,
				headers: { 'retry-after': '10' }
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		mockGet.mockRejectedValueOnce(mockError).mockResolvedValueOnce(successResponse)

		// Same ceiling as 503: Retry-After honored up to the 8s cap; jitter
		// adds up to 250ms, so assert a bounded range instead of an exact hit.
		await fetchPlus('test.com')

		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
		expect(sleepDelays[0]).toBeGreaterThanOrEqual(8_000)
		expect(sleepDelays[0]).toBeLessThan(8_250)
	})

	test('raise the adaptive cooldown on 503; a bare 200 does not decay it', async () => {
		const mockError = {
			response: {
				status: 503,
				headers: {}
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		// One rate-limited attempt, then a success.
		mockGet.mockRejectedValueOnce(mockError).mockResolvedValueOnce(successResponse)

		await fetchPlus('test.com')

		// fetchPlus registers pressure but NOT decay: a bare 200 is not proof
		// of a usable response (region refusals are 200-valued — decaying on
		// them kept knocking on a closed window through the 2026-10-06/07
		// soak). Decay belongs to item-level consumers.
		expect(getCooldownMs()).toBe(120_000)
		expect(getConsecutiveRateLimited()).toBe(1)
	})

	test('not register a non-transient 500 failure into the adaptive cooldown', async () => {
		mockStatus = { status: 500 }
		mockGet.mockImplementation(() => {
			const error: Error & { response: typeof mockStatus } = Object.assign(
				new Error('Request failed'),
				{ response: mockStatus }
			)
			return Promise.reject(error)
		})

		await expect(fetchPlus('test.com')).rejects.toEqual(mockStatus)

		// 500 is a hard failure, not rate-limit pressure: the cooldown must
		// stay untouched so a genuine transient window later is not masked.
		expect(getCooldownMs()).toBe(0)
		expect(getConsecutiveRateLimited()).toBe(0)
	})

	test('not add delay for non-429 errors', async () => {
		mockStatus = { status: 500 }
		mockGet.mockImplementation(() => {
			const error: Error & { response: typeof mockStatus } = Object.assign(
				new Error('Request failed'),
				{ response: mockStatus }
			)
			return Promise.reject(error)
		})

		await expect(fetchPlus('test.com')).rejects.toEqual(mockStatus)
		expect(pooledAxios.get).toHaveBeenCalledTimes(4)
		expect(sleepDelays).toEqual([])
	})
})

afterAll(() => {
	mock.restore()
})
