import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

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

		mockGet
			.mockRejectedValueOnce(mockError)
			.mockResolvedValueOnce(successResponse)

		const response = await fetchPlus('test.com')
		expect(response).toEqual(successResponse)
		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
		// Jittered backoff at retry 0: base 1000ms, jitter range ~750-1500ms
		expect(sleepDelays.length).toBe(1)
		expect(sleepDelays[0]).toBeGreaterThanOrEqual(500)
		expect(sleepDelays[0]).toBeLessThanOrEqual(1500)
	})

	test('retry with Retry-After header on 429', async () => {
		const mockError = {
			response: {
				status: 429,
				headers: { 'retry-after': '2' }
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		mockGet
			.mockRejectedValueOnce(mockError)
			.mockResolvedValueOnce(successResponse)

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
		expect(sleepDelays.length).toBe(2)
		// Retry 0: base 1000ms with jitter, retry 1: base 2000ms with jitter
		expect(sleepDelays[0]).toBeGreaterThanOrEqual(500)
		expect(sleepDelays[0]).toBeLessThanOrEqual(1500)
		expect(sleepDelays[1]).toBeGreaterThanOrEqual(1000)
		expect(sleepDelays[1]).toBeLessThanOrEqual(3000)
	})

	test('retry with exponential backoff on 429 with headers missing retry-after key', async () => {
		const mockError = {
			response: {
				status: 429,
				headers: { 'x-custom-header': 'value' }
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		mockGet
			.mockRejectedValueOnce(mockError)
			.mockResolvedValueOnce(successResponse)

		const response = await fetchPlus('test.com')

		expect(response).toEqual(successResponse)
		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
		// Jittered backoff at retry 0: base 1000ms, jitter range ~750-1500ms
		expect(sleepDelays.length).toBe(1)
		expect(sleepDelays[0]).toBeGreaterThanOrEqual(500)
		expect(sleepDelays[0]).toBeLessThanOrEqual(1500)
	})

	test('not add delay for non-retriable errors', async () => {
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

	test('retry with exponential backoff on 503', async () => {
		const mockError = {
			response: {
				status: 503,
				headers: {}
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		mockGet
			.mockRejectedValueOnce(mockError)
			.mockResolvedValueOnce(successResponse)

		const response = await fetchPlus('test.com')
		expect(response).toEqual(successResponse)
		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
		expect(sleepDelays.length).toBe(1)
		// Jittered backoff at retry 0: base 1000ms, jitter range ~750-1500ms
		expect(sleepDelays[0]).toBeGreaterThanOrEqual(500)
		expect(sleepDelays[0]).toBeLessThanOrEqual(1500)
	})

	test('retry with exponential backoff on 504', async () => {
		const mockError = {
			response: {
				status: 504,
				headers: {}
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		mockGet
			.mockRejectedValueOnce(mockError)
			.mockResolvedValueOnce(successResponse)

		const response = await fetchPlus('test.com')
		expect(response).toEqual(successResponse)
		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
		expect(sleepDelays.length).toBe(1)
		// Jittered backoff at retry 0: base 1000ms, jitter range ~750-1500ms
		expect(sleepDelays[0]).toBeGreaterThanOrEqual(500)
		expect(sleepDelays[0]).toBeLessThanOrEqual(1500)
	})

	test('not honor Retry-After header on 503', async () => {
		const mockError = {
			response: {
				status: 503,
				headers: { 'retry-after': '10' }
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		mockGet
			.mockRejectedValueOnce(mockError)
			.mockResolvedValueOnce(successResponse)

		const response = await fetchPlus('test.com')
		expect(response).toEqual(successResponse)
		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
		// Must use exponential backoff with jitter, NOT the Retry-After value (10000ms)
		expect(sleepDelays[0]).not.toBe(10000)
		expect(sleepDelays[0]).toBeGreaterThanOrEqual(500)
		expect(sleepDelays[0]).toBeLessThanOrEqual(1500)
	})

	test('not honor Retry-After header on 504', async () => {
		const mockError = {
			response: {
				status: 504,
				headers: { 'retry-after': '10' }
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		mockGet
			.mockRejectedValueOnce(mockError)
			.mockResolvedValueOnce(successResponse)

		const response = await fetchPlus('test.com')
		expect(response).toEqual(successResponse)
		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
		// Must use exponential backoff with jitter, NOT the Retry-After value (10000ms)
		expect(sleepDelays[0]).not.toBe(10000)
		expect(sleepDelays[0]).toBeGreaterThanOrEqual(500)
		expect(sleepDelays[0]).toBeLessThanOrEqual(1500)
	})
})

afterAll(() => {
	mock.restore()
})
