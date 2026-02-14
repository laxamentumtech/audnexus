import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { getPerformanceConfig } from '#config/performance'
import { getPerformanceMetrics } from '#config/performance/hooks'

/**
 * Register metrics route on Fastify instance
 * Returns performance metrics including memory usage and request timings
 */
export function registerMetricsRoute(fastify: FastifyInstance): void {
	fastify.get('/metrics', async (_request: FastifyRequest, reply: FastifyReply) => {
		const config = getPerformanceConfig()

		if (!config.METRICS_ENABLED) {
			reply.code(404)
			return { error: 'Metrics endpoint disabled' }
		}

		const metrics = getPerformanceMetrics()
		return metrics
	})
}

export default { registerMetricsRoute }
