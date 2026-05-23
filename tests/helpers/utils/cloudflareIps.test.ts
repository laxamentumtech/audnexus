import { afterAll, afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from 'bun:test'

const mockGet = mock()

mock.module('#helpers/utils/connectionPool', () => {
	return { default: { get: mockGet } }
})

import { AxiosResponse } from 'axios'

import {
	clearCache,
	CLOUDFLARE_IPS_API,
	fetchIpsFromApi,
	getAllIps,
	getCachedIps,
	getIps,
	isCacheValid
} from '#helpers/utils/cloudflareIps'
import pooledAxios from '#helpers/utils/connectionPool'

const mockCloudflareResponse = {
	result: {
		ipv4_cidrs: ['173.245.48.0/20', '103.21.244.0/22'],
		ipv6_cidrs: ['2400:cb00::/32', '2606:4700::/32'],
		etag: 'test-etag'
	},
	success: true,
	errors: [],
	messages: []
}

const mockCloudflareResponseV2 = {
	result: {
		ipv4_cidrs: ['173.245.48.0/20', '103.21.244.0/22', '192.0.2.0/24'],
		ipv6_cidrs: ['2400:cb00::/32', '2606:4700::/32', '2001:db8::/32'],
		etag: 'test-etag-v2'
	},
	success: true,
	errors: [],
	messages: []
}

describe('cloudflareIps', () => {
	beforeEach(() => {
		mockGet.mockClear()
		clearCache()
	})

	afterEach(() => {
		clearCache()
		mock.restore()
		setSystemTime()
	})

	describe('fetchIpsFromApi', () => {
		test('should fetch and return Cloudflare IP ranges', async () => {
			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			mockGet.mockResolvedValueOnce(mockResponse)

			const result = await fetchIpsFromApi()

			expect(result.ipv4).toEqual(mockCloudflareResponse.result.ipv4_cidrs)
			expect(result.ipv6).toEqual(mockCloudflareResponse.result.ipv6_cidrs)
			expect(result.fetchedAt).toBeGreaterThan(0)
			expect(pooledAxios.get).toHaveBeenCalledWith(CLOUDFLARE_IPS_API, {})
		})

		test('should throw error when API returns errors', async () => {
			const errorResponse = {
				data: {
					result: null,
					success: false,
					errors: [{ code: 1000, message: 'API Error' }],
					messages: []
				},
				status: 200
			} as AxiosResponse
			mockGet.mockResolvedValueOnce(errorResponse)

			await expect(fetchIpsFromApi()).rejects.toThrow('Cloudflare API returned errors')
		})

		test('should throw error when network request fails', async () => {
			mockGet.mockRejectedValueOnce(new Error('Network error'))

			await expect(fetchIpsFromApi()).rejects.toThrow()
		})
	})

	describe('getIps', () => {
		test('should fetch IPs when cache is empty', async () => {
			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			mockGet.mockResolvedValueOnce(mockResponse)

			const result = await getIps()

			expect(result.ipv4).toEqual(mockCloudflareResponse.result.ipv4_cidrs)
			expect(result.ipv6).toEqual(mockCloudflareResponse.result.ipv6_cidrs)
			expect(pooledAxios.get).toHaveBeenCalledTimes(1)
		})

		test('should return cached IPs on subsequent calls', async () => {
			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			mockGet.mockResolvedValueOnce(mockResponse)

			const result1 = await getIps()
			expect(result1.ipv4).toEqual(mockCloudflareResponse.result.ipv4_cidrs)
			expect(pooledAxios.get).toHaveBeenCalledTimes(1)

			const result2 = await getIps()
			expect(result2).toEqual(result1)
			expect(pooledAxios.get).toHaveBeenCalledTimes(1)
		})

		test('should deduplicate concurrent fetch requests (race condition prevention)', async () => {
			let resolveRequest: (value: AxiosResponse) => void
			const responsePromise = new Promise<AxiosResponse>((resolve) => {
				resolveRequest = resolve
			})
			mockGet.mockReturnValueOnce(responsePromise)

			const promise1 = getIps()
			const promise2 = getIps()
			const promise3 = getIps()

			expect(pooledAxios.get).toHaveBeenCalledTimes(1)

			resolveRequest!({ data: mockCloudflareResponse, status: 200 } as AxiosResponse)

			const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3])
			expect(result1).toEqual(result2)
			expect(result2).toEqual(result3)
			expect(result1.ipv4).toEqual(mockCloudflareResponse.result.ipv4_cidrs)

			expect(pooledAxios.get).toHaveBeenCalledTimes(1)
		})

		test('should refetch after cache expires', async () => {
			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			const mockResponseV2 = { data: mockCloudflareResponseV2, status: 200 } as AxiosResponse
			mockGet
				.mockResolvedValueOnce(mockResponse)
				.mockResolvedValueOnce(mockResponseV2)

			const result1 = await getIps()
			expect(result1.ipv4).toEqual(mockCloudflareResponse.result.ipv4_cidrs)

			setSystemTime(new Date(Date.now() + 25 * 60 * 60 * 1000))

			const result2 = await getIps()
			expect(result2.ipv4).toEqual(mockCloudflareResponseV2.result.ipv4_cidrs)
			expect(pooledAxios.get).toHaveBeenCalledTimes(2)
		})

		test('should return stale cached data when fetch fails', async () => {
			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			mockGet
				.mockResolvedValueOnce(mockResponse)
				.mockRejectedValueOnce(new Error('Network error'))

			const result1 = await getIps()
			expect(result1.ipv4).toEqual(mockCloudflareResponse.result.ipv4_cidrs)

			setSystemTime(new Date(Date.now() + 25 * 60 * 60 * 1000))

			const result2 = await getIps()
			expect(result2).toEqual(result1)
		})

		test('should return empty arrays when fetch fails and no cache exists', async () => {
			mockGet.mockRejectedValueOnce(new Error('Network error'))

			const result = await getIps()

			expect(result.ipv4).toEqual([])
			expect(result.ipv6).toEqual([])
			expect(result.fetchedAt).toBe(0)
		})
	})

	describe('getAllIps', () => {
		test('should return combined IPv4 and IPv6 ranges', async () => {
			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			mockGet.mockResolvedValueOnce(mockResponse)

			const result = await getAllIps()

			expect(result).toEqual([
				...mockCloudflareResponse.result.ipv4_cidrs,
				...mockCloudflareResponse.result.ipv6_cidrs
			])
		})
	})

	describe('getCachedIps', () => {
		test('should return null when cache is empty', () => {
			const result = getCachedIps()
			expect(result).toBeNull()
		})

		test('should return cached data when available', async () => {
			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			mockGet.mockResolvedValueOnce(mockResponse)

			await getIps()

			const result = getCachedIps()
			expect(result?.ipv4).toEqual(mockCloudflareResponse.result.ipv4_cidrs)
			expect(result?.ipv6).toEqual(mockCloudflareResponse.result.ipv6_cidrs)
		})

		test('should return expired data when available', async () => {
			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			mockGet.mockResolvedValueOnce(mockResponse)

			await getIps()

			setSystemTime(new Date(Date.now() + 25 * 60 * 60 * 1000))

			const result = getCachedIps()
			expect(result?.ipv4).toEqual(mockCloudflareResponse.result.ipv4_cidrs)
		})
	})

	describe('isCacheValid', () => {
		test('should return false when cache is empty', () => {
			expect(isCacheValid()).toBe(false)
		})

		test('should return true when cache is valid', async () => {
			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			mockGet.mockResolvedValueOnce(mockResponse)

			await getIps()
			expect(isCacheValid()).toBe(true)
		})

		test('should return false when cache is expired', async () => {
			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			mockGet.mockResolvedValueOnce(mockResponse)

			await getIps()

			setSystemTime(new Date(Date.now() + 25 * 60 * 60 * 1000))

			expect(isCacheValid()).toBe(false)
		})
	})

	describe('clearCache', () => {
		test('should clear the cache', async () => {
			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			mockGet.mockResolvedValueOnce(mockResponse)

			await getIps()
			expect(isCacheValid()).toBe(true)

			clearCache()
			expect(isCacheValid()).toBe(false)
			expect(getCachedIps()).toBeNull()
		})
	})
})

afterAll(() => {
	mock.restore()
})
