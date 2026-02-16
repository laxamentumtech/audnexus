import { AxiosResponse } from 'axios'

import pooledAxios from './connectionPool'

const CLOUDFLARE_IPS_API = 'https://api.cloudflare.com/client/v4/ips'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

interface CloudflareApiResponse {
	result: {
		ipv4_cidrs: string[]
		ipv6_cidrs: string[]
		etag: string
	}
	success: boolean
	errors: Array<{ code: number; message: string }>
	messages: string[]
}

interface CloudflareIpsResult {
	ipv4: string[]
	ipv6: string[]
	fetchedAt: number
}

interface CloudflareIpsCache {
	data: CloudflareIpsResult | null
	lastFetchTime: number
}

/**
 * In-memory cache for Cloudflare IP ranges
 * Module-level singleton that persists for the lifetime of the application
 */
const cache: CloudflareIpsCache = {
	data: null,
	lastFetchTime: 0
}

/**
 * In-flight promise for Cloudflare IP fetch
 * Used to prevent multiple concurrent API calls when cache is empty
 */
let fetchPromise: Promise<CloudflareIpsResult> | null = null

/**
 * Fetch Cloudflare IP ranges from the Cloudflare API
 * @returns Promise resolving to CloudflareIpsResult with ipv4 and ipv6 arrays
 * @throws Error if the API request fails
 */
async function fetchIpsFromApi(): Promise<CloudflareIpsResult> {
	const response: AxiosResponse<CloudflareApiResponse> = await pooledAxios.get(CLOUDFLARE_IPS_API)

	if (!response.data.success) {
		const errorMessages = response.data.errors.map((e) => `${e.code}: ${e.message}`).join(', ')
		throw new Error(`Cloudflare API returned errors: ${errorMessages}`)
	}

	return {
		ipv4: response.data.result.ipv4_cidrs,
		ipv6: response.data.result.ipv6_cidrs,
		fetchedAt: Date.now()
	}
}

/**
 * Get Cloudflare IP ranges, using cached data if available and not expired
 * Fetches from API if cache is empty or expired
 * @returns Promise resolving to CloudflareIpsResult
 */
async function getIps(): Promise<CloudflareIpsResult> {
	const now = Date.now()

	// Check if we have valid cached data
	if (cache.data && now - cache.lastFetchTime < CACHE_TTL_MS) {
		return cache.data
	}

	// If a fetch is already in progress, return that promise
	if (fetchPromise) {
		return fetchPromise
	}

	// Start a new fetch and store the promise
	fetchPromise = fetchIpsFromApi()
		.then((freshData) => {
			cache.data = freshData
			cache.lastFetchTime = now
			return freshData
		})
		.catch(() => {
			// If fetch fails, return cached data if available (even if expired)
			if (cache.data) {
				return cache.data
			}
			// Otherwise return empty arrays
			return {
				ipv4: [],
				ipv6: [],
				fetchedAt: 0
			}
		})
		.finally(() => {
			// Clear the in-flight promise so subsequent calls can retry
			fetchPromise = null
		})

	return fetchPromise
}

/**
 * Get all Cloudflare IP ranges as a flat array (both IPv4 and IPv6)
 * Useful for TRUSTED_PROXIES configuration
 * @returns Promise resolving to array of CIDR strings
 */
async function getAllIps(): Promise<string[]> {
	const result = await getIps()
	return [...result.ipv4, ...result.ipv6]
}

/**
 * Get cached Cloudflare IPs without triggering a fetch
 * Useful for checking if cache is populated
 * @returns CloudflareIpsResult or null if not cached
 */
function getCachedIps(): CloudflareIpsResult | null {
	const now = Date.now()
	if (cache.data && now - cache.lastFetchTime < CACHE_TTL_MS) {
		return cache.data
	}
	return cache.data // Return expired data if available
}

/**
 * Clear the Cloudflare IPs cache
 * Useful for testing or forcing a refresh
 */
function clearCache(): void {
	cache.data = null
	cache.lastFetchTime = 0
}

/**
 * Check if cache is valid (not expired)
 * @returns boolean indicating if cache has valid unexpired data
 */
function isCacheValid(): boolean {
	if (!cache.data) return false
	const now = Date.now()
	return now - cache.lastFetchTime < CACHE_TTL_MS
}

/**
 * CloudflareIps class for managing Cloudflare IP ranges
 * Provides a class-based interface with static methods for convenience
 */
export class CloudflareIps {
	/**
	 * Fetch Cloudflare IP ranges from the API
	 * @returns Promise resolving to CloudflareIpsResult
	 */
	static async fetchIps(): Promise<CloudflareIpsResult> {
		return fetchIpsFromApi()
	}

	/**
	 * Get Cloudflare IP ranges, using cache if available
	 * @returns Promise resolving to CloudflareIpsResult
	 */
	static async getIps(): Promise<CloudflareIpsResult> {
		return getIps()
	}

	/**
	 * Get all Cloudflare IP ranges as a flat array
	 * @returns Promise resolving to array of CIDR strings
	 */
	static async getAllIps(): Promise<string[]> {
		return getAllIps()
	}

	/**
	 * Get cached IPs without triggering a fetch
	 * @returns CloudflareIpsResult or null
	 */
	static getCachedIps(): CloudflareIpsResult | null {
		return getCachedIps()
	}

	/**
	 * Clear the cache
	 */
	static clearCache(): void {
		clearCache()
	}

	/**
	 * Check if cache is valid
	 * @returns boolean
	 */
	static isCacheValid(): boolean {
		return isCacheValid()
	}
}

export {
	CACHE_TTL_MS,
	clearCache,
	CLOUDFLARE_IPS_API,
	fetchIpsFromApi,
	getAllIps,
	getCachedIps,
	getIps,
	isCacheValid
}
export type { CloudflareApiResponse, CloudflareIpsResult }
