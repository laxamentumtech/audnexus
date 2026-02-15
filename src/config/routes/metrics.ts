import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

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
	return allowedIps.includes(clientIp)
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
		if (requestToken === authToken) {
			return true
		}
	}

	return false
}

/**
 * Register metrics route on Fastify instance
 * Returns performance metrics including memory usage and request timings
 */
export function registerMetricsRoute(fastify: FastifyInstance): void {
	fastify.get(
		'/metrics',
		{
			preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
				const config = getPerformanceConfig()

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
