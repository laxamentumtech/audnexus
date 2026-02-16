import crypto from 'crypto'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import ipRangeCheck from 'ip-range-check'

import { getPerformanceConfig } from '#config/performance'
import { getPerformanceMetrics } from '#config/performance/hooks'

/**
 * Parse comma-separated environment variable into array
 * Returns undefined if value is not set or empty
 */
export function parseEnvArray(value: string | undefined): string[] | undefined {
	if (value === undefined || value.trim() === '') return undefined
	const result = value
		.split(',')
		.map((ip) => ip.trim())
		.filter((ip) => ip.length > 0)
	return result.length > 0 ? result : undefined
}

/**
 * Check if request IP is in allowed list
 * Supports single IPs and CIDR ranges (e.g., "192.168.1.0/24")
 */
export function isIpAllowed(request: FastifyRequest, allowedIps: string[]): boolean {
	// Extract first IP from x-forwarded-for header (handles string or array)
	const forwardedFor = request.headers['x-forwarded-for']
	let firstForwardedIp: string | undefined

	if (Array.isArray(forwardedFor)) {
		firstForwardedIp = forwardedFor[0]
	} else if (typeof forwardedFor === 'string') {
		firstForwardedIp = forwardedFor.split(',')[0]
	}

	const clientIp = request.ip ?? firstForwardedIp?.trim() ?? 'unknown'

	// Handle 'unknown' IP specially (not a valid IP for ip-range-check)
	if (clientIp === 'unknown') {
		return allowedIps.includes('unknown')
	}

	try {
		return ipRangeCheck(clientIp, allowedIps)
	} catch {
		// Treat parsing errors as non-match
		return false
	}
}

/**
 * Validate metrics authentication
 * Returns true if access is allowed, false if denied
 */
function validateMetricsAuth(request: FastifyRequest): boolean {
	const authToken = process.env.METRICS_AUTH_TOKEN
	const allowedIps = parseEnvArray(process.env.METRICS_ALLOWED_IPS)

	// If neither auth token nor allowed IPs are configured, skip auth check
	if (!authToken && !allowedIps) {
		return true
	}

	// Check IP-based access first
	if (allowedIps && allowedIps.length > 0) {
		if (isIpAllowed(request, allowedIps)) {
			return true
		}
	}

	// Check token-based access
	if (authToken) {
		const requestToken = request.headers['x-metrics-token']?.toString()
		if (requestToken && authToken) {
			const bufRequest = Buffer.from(requestToken)
			const bufAuth = Buffer.from(authToken)
			if (bufRequest.length !== bufAuth.length) {
				return false
			}
			if (crypto.timingSafeEqual(bufRequest, bufAuth)) {
				return true
			}
		}
	}

	return false
}

/**
 * Register metrics route on Fastify instance
 * Returns performance metrics including memory usage and request timings
 */
export function registerMetricsRoute(fastify: FastifyInstance): void {
	const config = getPerformanceConfig()

	// Check if metrics are enabled but no auth is configured
	if (config.METRICS_ENABLED) {
		const authToken = process.env.METRICS_AUTH_TOKEN
		const allowedIps = parseEnvArray(process.env.METRICS_ALLOWED_IPS)

		if (!authToken && !allowedIps) {
			fastify.log.warn(
				'Metrics endpoint is enabled without authentication (METRICS_AUTH_TOKEN and METRICS_ALLOWED_IPS not set). The /metrics endpoint is publicly accessible.'
			)
		}
	}

	fastify.get(
		'/metrics',
		{
			preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
				// Return 404 if metrics endpoint is disabled
				if (!config.METRICS_ENABLED) {
					return reply.code(404).send({ error: 'Metrics endpoint disabled' })
				}

				// Validate auth if configured
				if (!validateMetricsAuth(request)) {
					return reply.code(403).send({ error: 'Forbidden' })
				}
			}
		},
		async () => {
			const metrics = getPerformanceMetrics()
			return metrics
		}
	)
}

export default { registerMetricsRoute }
