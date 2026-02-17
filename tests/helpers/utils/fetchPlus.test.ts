jest.mock('#helpers/utils/connectionPool')

import type { AxiosResponse } from 'axios'

import pooledAxios from '#helpers/utils/connectionPool'
import fetchPlus from '#helpers/utils/fetchPlus'

let mockStatus: { status: number; headers?: Record<string, string> }

describe('fetchPlus should', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		jest.useRealTimers()
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	test('return response', async () => {
		const mockResponse = { data: 'test', status: 200 } as AxiosResponse
		;(pooledAxios.get as jest.Mock).mockImplementation(() => Promise.resolve(mockResponse))
		const response = await fetchPlus('test')
		expect(response).toEqual(mockResponse)
	})

	test('return error with default retries', async () => {
		mockStatus = { status: 500 }
		;(pooledAxios.get as jest.Mock).mockImplementation(() =>
			Promise.reject({ response: mockStatus })
		)

		await expect(fetchPlus('test.com')).rejects.toEqual(mockStatus)
		expect(pooledAxios.get).toHaveBeenCalledTimes(4)
	})

	test('retry on non-200', async () => {
		mockStatus = { status: 200 }
		;(pooledAxios.get as jest.Mock)
			.mockRejectedValueOnce({ status: 500 })
			.mockResolvedValueOnce(mockStatus as AxiosResponse)
		await expect(fetchPlus('test.com')).resolves.toEqual(mockStatus)
	})

	test('retry the correct number of times before hard failing', async () => {
		mockStatus = { status: 500 }
		;(pooledAxios.get as jest.Mock).mockImplementation(() =>
			Promise.reject({ response: mockStatus })
		)

		await expect(fetchPlus('test.com', {}, 2)).rejects.toEqual(mockStatus)
		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
	})

	test('retry with exponential backoff on 429 without Retry-After header', async () => {
		jest.useFakeTimers()
		const mockError = {
			response: {
				status: 429,
				headers: {}
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		;(pooledAxios.get as jest.Mock)
			.mockRejectedValueOnce(mockError)
			.mockResolvedValueOnce(successResponse)

		const fetchPromise = fetchPlus('test.com')

		await jest.advanceTimersByTimeAsync(1000)
		const response = await fetchPromise
		expect(response).toEqual(successResponse)
		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
	})

	test('retry with Retry-After header on 429', async () => {
		jest.useFakeTimers()
		const mockError = {
			response: {
				status: 429,
				headers: { 'retry-after': '2' }
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		;(pooledAxios.get as jest.Mock)
			.mockRejectedValueOnce(mockError)
			.mockResolvedValueOnce(successResponse)

		const fetchPromise = fetchPlus('test.com')

		await jest.advanceTimersByTimeAsync(2000)

		const response = await fetchPromise
		expect(response).toEqual(successResponse)
		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
	})

	test('retry with increasing exponential backoff on multiple 429s', async () => {
		jest.useFakeTimers()
		const mockError = {
			response: {
				status: 429,
				headers: {}
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		;(pooledAxios.get as jest.Mock)
			.mockRejectedValueOnce(mockError)
			.mockRejectedValueOnce(mockError)
			.mockResolvedValueOnce(successResponse)

		const fetchPromise = fetchPlus('test.com')

		await jest.advanceTimersByTimeAsync(1000)
		await jest.advanceTimersByTimeAsync(2000)

		const response = await fetchPromise
		expect(response).toEqual(successResponse)
		expect(pooledAxios.get).toHaveBeenCalledTimes(3)
	})

	test('retry with exponential backoff on 429 with headers missing retry-after key', async () => {
		jest.useFakeTimers()
		const mockError = {
			response: {
				status: 429,
				headers: { 'x-custom-header': 'value' }
			}
		}
		const successResponse = { data: 'success', status: 200 } as AxiosResponse

		;(pooledAxios.get as jest.Mock)
			.mockRejectedValueOnce(mockError)
			.mockResolvedValueOnce(successResponse)

		const fetchPromise = fetchPlus('test.com')

		await jest.advanceTimersByTimeAsync(1000)
		const response = await fetchPromise
		expect(response).toEqual(successResponse)
		expect(pooledAxios.get).toHaveBeenCalledTimes(2)
	})

	test('not add delay for non-429 errors', async () => {
		mockStatus = { status: 500 }
		;(pooledAxios.get as jest.Mock).mockImplementation(() =>
			Promise.reject({ response: mockStatus })
		)

		await expect(fetchPlus('test.com')).rejects.toEqual(mockStatus)
		expect(pooledAxios.get).toHaveBeenCalledTimes(4)
	})
})
