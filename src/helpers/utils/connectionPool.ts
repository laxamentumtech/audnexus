import axios, { AxiosInstance } from 'axios'
import http from 'node:http'
import https from 'node:https'

/**
 * Parse and validate a positive integer from environment variable
 * Falls back to default value if invalid
 */
function parsePositiveInt(value: string | undefined, defaultValue: number): number {
	if (!value) return defaultValue
	const parsed = Number(value)
	if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed <= 0) {
		return defaultValue
	}
	return parsed
}

/**
 * Environment variable configurations for connection pooling
 */
const CONFIG = {
	maxSockets: parsePositiveInt(process.env.HTTP_MAX_SOCKETS, 50),
	timeout: parsePositiveInt(process.env.HTTP_TIMEOUT_MS, 30000),
	maxFreeSockets: 10,
	keepAlive: true
} as const

/**
 * Guardrail: Ensure maxSockets does not exceed 50
 */
const GUARDRAIL_MAX_SOCKETS = Math.min(CONFIG.maxSockets, 50)

/**
 * HTTP agent for HTTP connections with keep-alive enabled
 */
const httpAgent = new http.Agent({
	keepAlive: CONFIG.keepAlive,
	maxSockets: GUARDRAIL_MAX_SOCKETS,
	maxFreeSockets: CONFIG.maxFreeSockets
})

/**
 * HTTPS agent for HTTPS connections with keep-alive enabled
 */
const httpsAgent = new https.Agent({
	keepAlive: CONFIG.keepAlive,
	maxSockets: GUARDRAIL_MAX_SOCKETS,
	maxFreeSockets: CONFIG.maxFreeSockets
})

/**
 * Axios instance configured with connection pooling for HTTP/HTTPS requests
 * Uses http.Agent and https.Agent with keep-alive to reuse connections
 * and reduce connection overhead for repeated requests
 */
export const pooledAxios: AxiosInstance = axios.create({
	httpAgent,
	httpsAgent,
	timeout: CONFIG.timeout,

	// Validate status to match fetchPlus behavior (only resolve on 200)
	validateStatus: (status: number) => status === 200
})

/**
 * Get the current connection pool configuration
 * Useful for debugging and monitoring
 */
export function getPoolConfig() {
	return {
		maxSockets: GUARDRAIL_MAX_SOCKETS,
		maxFreeSockets: CONFIG.maxFreeSockets,
		keepAlive: CONFIG.keepAlive,
		timeout: CONFIG.timeout
	}
}

/**
 * Close all pooled connections gracefully
 * Should be called during application shutdown
 */
export async function closePool(): Promise<void> {
	httpAgent.destroy()
	httpsAgent.destroy()
}

export default pooledAxios
