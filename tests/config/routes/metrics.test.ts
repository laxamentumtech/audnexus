import Fastify from 'fastify'

import { PerformanceConfig, setPerformanceConfig } from '#config/performance'
import { registerMetricsRoute } from '#config/routes/metrics'

describe('Metrics Route', () => {
	const createTestConfig = (overrides: Partial<PerformanceConfig>): PerformanceConfig => ({
		USE_PARALLEL_SCHEDULER: false,
		USE_CONNECTION_POOLING: true,
		USE_COMPACT_JSON: true,
		USE_SORTED_KEYS: false,
		CIRCUIT_BREAKER_ENABLED: true,
		MAX_CONCURRENT_REQUESTS: 50,
		SCHEDULER_CONCURRENCY: 5,
		...overrides
	})

	describe('GET /metrics', () => {
		it('should return metrics when enabled', async () => {
			setPerformanceConfig(createTestConfig({ CIRCUIT_BREAKER_ENABLED: true }))

			const fastify = Fastify()
			registerMetricsRoute(fastify)
			await fastify.ready()

			const response = await fastify.inject({
				method: 'GET',
				url: '/metrics'
			})

			expect(response.statusCode).toBe(200)
			const body = JSON.parse(response.body)
			expect(body.memory).toBeDefined()
			expect(body.uptime).toBeDefined()
			expect(body.requests).toBeDefined()

			await fastify.close()
		})

		it('should return 404 when disabled', async () => {
			setPerformanceConfig(createTestConfig({ CIRCUIT_BREAKER_ENABLED: false }))

			const fastify = Fastify()
			registerMetricsRoute(fastify)
			await fastify.ready()

			const response = await fastify.inject({
				method: 'GET',
				url: '/metrics'
			})

			expect(response.statusCode).toBe(404)
			const body = JSON.parse(response.body)
			expect(body.error).toBe('Metrics endpoint disabled')

			await fastify.close()
		})
	})
})
