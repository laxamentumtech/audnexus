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
import { UpstreamGoneError } from '#helpers/utils/upstreamGone'

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

	// Retry-After HTTP-date coverage. 429 is used because it applies the
	// retry delay without jitter, so exact values can be asserted. Date.now
	// is pinned (via the relative offset in the header, not a wall-clock
	// race) so the delay is deterministic.
	test('honor a future HTTP-date Retry-After on 429 (delay ≈ date - now)', async () => {
		const now = Date.now()
		const mockError = {
			response: {
				status: 429,
				headers: { 'retry-after': new Date(now + 2_500).toISOString() }
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		mockGet.mockRejectedValueOnce(mockError).mockResolvedValueOnce(successResponse)

		const response = await fetchPlus('test.com')

		expect(response).toEqual(successResponse)
		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
		// The window between building the header and computing the delay is
		// microseconds; a tight band keeps the test race-free without pinning
		// the wall clock.
		expect(sleepDelays).toHaveLength(1)
		// The delay is (date - now-at-compute); now-at-compute is a hair after
		// the header was built, so the delay is at most the offset (inclusive)
		// and well above the offset minus the microseconds of the async gap.
		expect(sleepDelays[0]).toBeGreaterThanOrEqual(2_000)
		expect(sleepDelays[0]).toBeLessThanOrEqual(2_500)
	})

	test('clamp a future HTTP-date Retry-After longer than the 8s ceiling', async () => {
		const now = Date.now()
		const mockError = {
			response: {
				status: 429,
				headers: { 'retry-after': new Date(now + 30_000).toISOString() }
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		mockGet.mockRejectedValueOnce(mockError).mockResolvedValueOnce(successResponse)

		await fetchPlus('test.com')

		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
		expect(sleepDelays).toEqual([8_000])
	})

	test('fall back to exponential backoff on an expired HTTP-date Retry-After', async () => {
		const now = Date.now()
		const mockError = {
			response: {
				status: 429,
				headers: { 'retry-after': new Date(now - 5_000).toISOString() }
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		mockGet.mockRejectedValueOnce(mockError).mockResolvedValueOnce(successResponse)

		const response = await fetchPlus('test.com')

		expect(response).toEqual(successResponse)
		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
		// An expired date yields no delay, so the exponential backoff for the
		// first retry (1s) applies, exactly as with an absent header.
		expect(sleepDelays).toEqual([1_000])
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

	test('register a cooldown derived from a future HTTP-date Retry-After, not the ladder base', async () => {
		// The cooldown side of the HTTP-date path: the parsed date's
		// milliseconds feed registerRateLimited as the cooldown floor. A
		// 30-min-ahead date is far above the ladder base (120s), so the
		// observed cooldown must be date-derived. The header is built from a
		// fixed relative offset; by the time the delay is computed the clock
		// has advanced microseconds, so the value is at most the offset and
		// well above it minus the async gap — a tight band keeps it race-free
		// without pinning the wall clock.
		const now = Date.now()
		const offset = 30 * 60 * 1000
		const mockError = {
			response: {
				status: 429,
				headers: { 'retry-after': new Date(now + offset).toISOString() }
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		mockGet.mockRejectedValueOnce(mockError).mockResolvedValueOnce(successResponse)

		const response = await fetchPlus('test.com')

		expect(response).toEqual(successResponse)
		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
		// The per-retry delay still clamps to the 8s ceiling (429, no jitter).
		expect(sleepDelays).toEqual([8_000])
		// Cooldown is the date-derived milliseconds, not the 120s ladder base
		// nor any backoff value: below the offset (clock advanced since the
		// header was built), above offset minus a generous millisecond band.
		expect(getConsecutiveRateLimited()).toBe(1)
		expect(getCooldownMs()).toBeLessThanOrEqual(offset)
		expect(getCooldownMs()).toBeGreaterThanOrEqual(offset - 5_000)
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

	test('rejects with UpstreamGoneError on the search-page redirect — one attempt, no cooldown', async () => {
		// Audible 301s a dead deep link to the search page (→ 503); axios
		// surfaces the post-redirect URL on error.response.request.res.
		const goneResponseUrl = 'https://www.audible.com/search?advsearchKeywords='
		const error: Error & {
			response: { status: number; request: { res: { responseUrl: string } } }
		} = Object.assign(new Error('Request failed'), {
			response: { status: 503, request: { res: { responseUrl: goneResponseUrl } } }
		})
		mockGet.mockImplementation(() => Promise.reject(error))

		let caught: unknown
		try {
			await fetchPlus('test.com')
		} catch (e) {
			caught = e
		}
		// Terminal: one Axios attempt (Axios's internal follow of the 301 is
		// not a second call), no sleep delay, cooldown untouched.
		expect(caught).toBeInstanceOf(UpstreamGoneError)
		expect(pooledAxios.get).toHaveBeenCalledTimes(1)
		expect(sleepDelays).toEqual([])
		expect(getCooldownMs()).toBe(0)
	})

	test('control: a plain 503 without a redirect URL still retries 3x and raises the cooldown', async () => {
		mockStatus = { status: 503 }
		mockGet.mockImplementation(() => {
			const error: Error & { response: typeof mockStatus } = Object.assign(
				new Error('Request failed'),
				{ response: mockStatus }
			)
			return Promise.reject(error)
		})

		await expect(fetchPlus('test.com')).rejects.toEqual(mockStatus)
		expect(pooledAxios.get).toHaveBeenCalledTimes(4)
		expect(getCooldownMs()).toBeGreaterThan(0)
	})
})

afterAll(() => {
	mock.restore()
})
