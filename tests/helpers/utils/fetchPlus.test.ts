jest.mock('#helpers/utils/connectionPool')

import type { AxiosResponse } from 'axios'

import pooledAxios from '#helpers/utils/connectionPool'
import fetchPlus from '#helpers/utils/fetchPlus'

let mockStatus: { status: number }

describe('fetchPlus should', () => {
	beforeEach(() => {
		jest.clearAllMocks()
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
})
