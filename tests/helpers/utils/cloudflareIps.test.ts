jest.mock('#helpers/utils/connectionPool')

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
		jest.clearAllMocks()
		clearCache()
		jest.useRealTimers()
	})

	afterEach(() => {
		clearCache()
		jest.useRealTimers()
	})

	describe('fetchIpsFromApi', () => {
		test('should fetch and return Cloudflare IP ranges', async () => {
			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			;(pooledAxios.get as jest.Mock).mockResolvedValueOnce(mockResponse)

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
			;(pooledAxios.get as jest.Mock).mockResolvedValueOnce(errorResponse)

			await expect(fetchIpsFromApi()).rejects.toThrow('Cloudflare API returned errors')
		})

		test('should throw error when network request fails', async () => {
			;(pooledAxios.get as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

			await expect(fetchIpsFromApi()).rejects.toThrow()
		})
	})

	describe('getIps', () => {
		test('should fetch IPs when cache is empty', async () => {
			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			;(pooledAxios.get as jest.Mock).mockResolvedValueOnce(mockResponse)

			const result = await getIps()

			expect(result.ipv4).toEqual(mockCloudflareResponse.result.ipv4_cidrs)
			expect(result.ipv6).toEqual(mockCloudflareResponse.result.ipv6_cidrs)
			expect(pooledAxios.get).toHaveBeenCalledTimes(1)
		})

		test('should return cached IPs on subsequent calls', async () => {
			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			;(pooledAxios.get as jest.Mock).mockResolvedValueOnce(mockResponse)

			// First call - should fetch
			const result1 = await getIps()
			expect(result1.ipv4).toEqual(mockCloudflareResponse.result.ipv4_cidrs)
			expect(pooledAxios.get).toHaveBeenCalledTimes(1)

			// Second call - should use cache
			const result2 = await getIps()
			expect(result2).toEqual(result1)
			expect(pooledAxios.get).toHaveBeenCalledTimes(1) // No additional fetch
		})

		test('should deduplicate concurrent fetch requests (race condition prevention)', async () => {
			// Create a delayed response to simulate slow API
			let resolveRequest: (value: AxiosResponse) => void
			const responsePromise = new Promise<AxiosResponse>((resolve) => {
				resolveRequest = resolve
			})
			;(pooledAxios.get as jest.Mock).mockReturnValueOnce(responsePromise)

			// Make multiple concurrent calls while cache is empty
			const promise1 = getIps()
			const promise2 = getIps()
			const promise3 = getIps()

			// Should only make one API call
			expect(pooledAxios.get).toHaveBeenCalledTimes(1)

			// Resolve the API call
			resolveRequest!({ data: mockCloudflareResponse, status: 200 } as AxiosResponse)

			// All promises should resolve with the same data
			const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3])
			expect(result1).toEqual(result2)
			expect(result2).toEqual(result3)
			expect(result1.ipv4).toEqual(mockCloudflareResponse.result.ipv4_cidrs)

			// Should still only have made one API call
			expect(pooledAxios.get).toHaveBeenCalledTimes(1)
		})

		test('should refetch after cache expires', async () => {
			jest.useFakeTimers()

			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			const mockResponseV2 = { data: mockCloudflareResponseV2, status: 200 } as AxiosResponse
			;(pooledAxios.get as jest.Mock)
				.mockResolvedValueOnce(mockResponse)
				.mockResolvedValueOnce(mockResponseV2)

			// First call - should fetch
			const result1 = await getIps()
			expect(result1.ipv4).toEqual(mockCloudflareResponse.result.ipv4_cidrs)

			// Advance time by 25 hours (cache expires after 24 hours)
			jest.advanceTimersByTime(25 * 60 * 60 * 1000)

			// Second call - should refetch
			const result2 = await getIps()
			expect(result2.ipv4).toEqual(mockCloudflareResponseV2.result.ipv4_cidrs)
			expect(pooledAxios.get).toHaveBeenCalledTimes(2)

			jest.useRealTimers()
		})

		test('should return stale cached data when fetch fails', async () => {
			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			;(pooledAxios.get as jest.Mock)
				.mockResolvedValueOnce(mockResponse)
				.mockRejectedValueOnce(new Error('Network error'))

			// First call - should fetch and cache
			const result1 = await getIps()
			expect(result1.ipv4).toEqual(mockCloudflareResponse.result.ipv4_cidrs)

			// Force cache expiration by manipulating time
			jest.useFakeTimers()
			jest.advanceTimersByTime(25 * 60 * 60 * 1000)

			// Second call - fetch fails, should return stale cache
			const result2 = await getIps()
			expect(result2).toEqual(result1)

			jest.useRealTimers()
		})

		test('should return empty arrays when fetch fails and no cache exists', async () => {
			;(pooledAxios.get as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

			const result = await getIps()

			expect(result.ipv4).toEqual([])
			expect(result.ipv6).toEqual([])
			expect(result.fetchedAt).toBe(0)
		})
	})

	describe('getAllIps', () => {
		test('should return combined IPv4 and IPv6 ranges', async () => {
			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			;(pooledAxios.get as jest.Mock).mockResolvedValueOnce(mockResponse)

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
			;(pooledAxios.get as jest.Mock).mockResolvedValueOnce(mockResponse)

			// Populate cache
			await getIps()

			const result = getCachedIps()
			expect(result?.ipv4).toEqual(mockCloudflareResponse.result.ipv4_cidrs)
			expect(result?.ipv6).toEqual(mockCloudflareResponse.result.ipv6_cidrs)
		})

		test('should return expired data when available', async () => {
			jest.useFakeTimers()

			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			;(pooledAxios.get as jest.Mock).mockResolvedValueOnce(mockResponse)

			// Populate cache
			await getIps()

			// Advance time past expiration
			jest.advanceTimersByTime(25 * 60 * 60 * 1000)

			// Should still return expired data
			const result = getCachedIps()
			expect(result?.ipv4).toEqual(mockCloudflareResponse.result.ipv4_cidrs)

			jest.useRealTimers()
		})
	})

	describe('isCacheValid', () => {
		test('should return false when cache is empty', () => {
			expect(isCacheValid()).toBe(false)
		})

		test('should return true when cache is valid', async () => {
			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			;(pooledAxios.get as jest.Mock).mockResolvedValueOnce(mockResponse)

			await getIps()
			expect(isCacheValid()).toBe(true)
		})

		test('should return false when cache is expired', async () => {
			jest.useFakeTimers()

			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			;(pooledAxios.get as jest.Mock).mockResolvedValueOnce(mockResponse)

			await getIps()

			// Advance time past expiration
			jest.advanceTimersByTime(25 * 60 * 60 * 1000)

			expect(isCacheValid()).toBe(false)

			jest.useRealTimers()
		})
	})

	describe('clearCache', () => {
		test('should clear the cache', async () => {
			const mockResponse = { data: mockCloudflareResponse, status: 200 } as AxiosResponse
			;(pooledAxios.get as jest.Mock).mockResolvedValueOnce(mockResponse)

			// Populate cache
			await getIps()
			expect(isCacheValid()).toBe(true)

			// Clear cache
			clearCache()
			expect(isCacheValid()).toBe(false)
			expect(getCachedIps()).toBeNull()
		})
	})
})
