jest.mock('axios')

import type { AxiosResponse } from 'axios'
import axios from 'axios'

import fetchPlus from '#helpers/utils/fetchPlus'

let mockStatus: { status: number }

describe('fetchPlus should', () => {
	test('return response', async () => {
		const mockResponse = { data: 'test', status: 200 } as AxiosResponse
		jest.spyOn(axios, 'get').mockImplementation(() => Promise.resolve(mockResponse))
		const response = await fetchPlus('test')
		expect(response).toEqual(mockResponse)
	})

	test('return error with default retries', async () => {
		mockStatus = { status: 500 }
		jest.spyOn(axios, 'get').mockImplementation(() => Promise.reject({ response: mockStatus }))

		await expect(fetchPlus('test.com')).rejects.toEqual(mockStatus)
		expect(axios.get).toHaveBeenCalledTimes(4)
	})

	test('retry on non-200', async () => {
		mockStatus = { status: 200 }
		jest.spyOn(axios, 'get').mockImplementationOnce(() => Promise.reject({ status: 500 }))
		jest
			.spyOn(axios, 'get')
			.mockImplementationOnce(() => Promise.resolve(mockStatus as AxiosResponse))
		await expect(fetchPlus('test.com')).resolves.toEqual(mockStatus)
	})

	test('retry the correct number of times before hard failing', async () => {
		mockStatus = { status: 500 }
		jest.spyOn(axios, 'get').mockImplementation(() => Promise.reject({ response: mockStatus }))

		await expect(fetchPlus('test.com', {}, 2)).rejects.toEqual(mockStatus)
		expect(axios.get).toHaveBeenCalledTimes(2)
	})
})
