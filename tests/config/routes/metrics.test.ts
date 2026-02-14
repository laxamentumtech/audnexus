import Fastify from 'fastify'

import { PerformanceConfig, setPerformanceConfig } from '#config/performance'
import { registerMetricsRoute } from '#config/routes/metrics'

describe('Metrics Route - Authentication', () => {
	const createTestConfig = (overrides: Partial<PerformanceConfig>): PerformanceConfig => ({
		USE_PARALLEL_SCHEDULER: false,
		USE_CONNECTION_POOLING: true,
		USE_COMPACT_JSON: true,
		USE_SORTED_KEYS: false,
		CIRCUIT_BREAKER_ENABLED: true,
		METRICS_ENABLED: true,
		MAX_CONCURRENT_REQUESTS: 50,
		SCHEDULER_CONCURRENCY: 5,
		...overrides
	})

	afterEach(() => {
		delete process.env.METRICS_AUTH_TOKEN
		delete process.env.METRICS_ALLOWED_IPS
	})

	describe('parseEnvArray behavior (via route)', () => {
		it('returns 200 when METRICS_ALLOWED_IPS contains valid IPs', async () => {
			process.env.METRICS_ALLOWED_IPS = '192.168.1.1, 10.0.0.1'
			setPerformanceConfig(createTestConfig({ METRICS_ENABLED: true }))

			const fastify = Fastify()
			registerMetricsRoute(fastify)
			await fastify.ready()

			const response = await fastify.inject({
				method: 'GET',
				url: '/metrics',
				remoteAddress: '10.0.0.1'
			})

			expect(response.statusCode).toBe(200)
			await fastify.close()
		})

		it('returns 403 when IP not in METRICS_ALLOWED_IPS', async () => {
			process.env.METRICS_ALLOWED_IPS = '192.168.1.1, 10.0.0.1'
			setPerformanceConfig(createTestConfig({ METRICS_ENABLED: true }))

			const fastify = Fastify()
			registerMetricsRoute(fastify)
			await fastify.ready()

			const response = await fastify.inject({
				method: 'GET',
				url: '/metrics',
				remoteAddress: '172.16.0.1'
			})

			expect(response.statusCode).toBe(403)
			await fastify.close()
		})

		it('trims whitespace from IP entries', async () => {
			process.env.METRICS_ALLOWED_IPS = ' 192.168.1.1 , 10.0.0.1 '
			setPerformanceConfig(createTestConfig({ METRICS_ENABLED: true }))

			const fastify = Fastify()
			registerMetricsRoute(fastify)
			await fastify.ready()

			const response = await fastify.inject({
				method: 'GET',
				url: '/metrics',
				remoteAddress: '10.0.0.1'
			})

			expect(response.statusCode).toBe(200)
			await fastify.close()
		})

		it('filters out empty strings in IP list', async () => {
			process.env.METRICS_ALLOWED_IPS = '192.168.1.1,,10.0.0.1'
			setPerformanceConfig(createTestConfig({ METRICS_ENABLED: true }))

			const fastify = Fastify()
			registerMetricsRoute(fastify)
			await fastify.ready()

			const response = await fastify.inject({
				method: 'GET',
				url: '/metrics',
				remoteAddress: '10.0.0.1'
			})

			expect(response.statusCode).toBe(200)
			await fastify.close()
		})
	})

	describe('validateMetricsAuth with token auth', () => {
		it('returns 200 when METRICS_AUTH_TOKEN matches x-metrics-token header', async () => {
			process.env.METRICS_AUTH_TOKEN = 'secret-token-123'
			setPerformanceConfig(createTestConfig({ METRICS_ENABLED: true }))

			const fastify = Fastify()
			registerMetricsRoute(fastify)
			await fastify.ready()

			const response = await fastify.inject({
				method: 'GET',
				url: '/metrics',
				headers: { 'x-metrics-token': 'secret-token-123' }
			})

			expect(response.statusCode).toBe(200)
			await fastify.close()
		})

		it('returns 403 when token does not match', async () => {
			process.env.METRICS_AUTH_TOKEN = 'secret-token-123'
			setPerformanceConfig(createTestConfig({ METRICS_ENABLED: true }))

			const fastify = Fastify()
			registerMetricsRoute(fastify)
			await fastify.ready()

			const response = await fastify.inject({
				method: 'GET',
				url: '/metrics',
				headers: { 'x-metrics-token': 'wrong-token' }
			})

			expect(response.statusCode).toBe(403)
			await fastify.close()
		})

		it('returns 403 when token header is missing', async () => {
			process.env.METRICS_AUTH_TOKEN = 'secret-token-123'
			setPerformanceConfig(createTestConfig({ METRICS_ENABLED: true }))

			const fastify = Fastify()
			registerMetricsRoute(fastify)
			await fastify.ready()

			const response = await fastify.inject({
				method: 'GET',
				url: '/metrics',
				headers: {}
			})

			expect(response.statusCode).toBe(403)
			await fastify.close()
		})
	})

	describe('validateMetricsAuth with IP auth', () => {
		it('returns 200 when request.ip is in METRICS_ALLOWED_IPS', async () => {
			process.env.METRICS_ALLOWED_IPS = '192.168.1.1,10.0.0.1'
			setPerformanceConfig(createTestConfig({ METRICS_ENABLED: true }))

			const fastify = Fastify()
			registerMetricsRoute(fastify)
			await fastify.ready()

			const response = await fastify.inject({
				method: 'GET',
				url: '/metrics',
				remoteAddress: '192.168.1.1'
			})

			expect(response.statusCode).toBe(200)
			await fastify.close()
		})

		it('returns 403 when IP not in list', async () => {
			process.env.METRICS_ALLOWED_IPS = '192.168.1.1,10.0.0.1'
			setPerformanceConfig(createTestConfig({ METRICS_ENABLED: true }))

			const fastify = Fastify()
			registerMetricsRoute(fastify)
			await fastify.ready()

			const response = await fastify.inject({
				method: 'GET',
				url: '/metrics',
				remoteAddress: '172.16.0.1'
			})

			expect(response.statusCode).toBe(403)
			await fastify.close()
		})
	})

	describe('validateMetricsAuth fallback', () => {
		it('returns 200 when neither env var is set', async () => {
			delete process.env.METRICS_AUTH_TOKEN
			delete process.env.METRICS_ALLOWED_IPS
			setPerformanceConfig(createTestConfig({ METRICS_ENABLED: true }))

			const fastify = Fastify()
			registerMetricsRoute(fastify)
			await fastify.ready()

			const response = await fastify.inject({
				method: 'GET',
				url: '/metrics'
			})

			expect(response.statusCode).toBe(200)
			await fastify.close()
		})
	})
})

describe('Metrics Route', () => {
	const createTestConfig = (overrides: Partial<PerformanceConfig>): PerformanceConfig => ({
		USE_PARALLEL_SCHEDULER: false,
		USE_CONNECTION_POOLING: true,
		USE_COMPACT_JSON: true,
		USE_SORTED_KEYS: false,
		CIRCUIT_BREAKER_ENABLED: true,
		METRICS_ENABLED: true,
		MAX_CONCURRENT_REQUESTS: 50,
		SCHEDULER_CONCURRENCY: 5,
		...overrides
	})

	describe('GET /metrics', () => {
		it('should return metrics when enabled', async () => {
			setPerformanceConfig(createTestConfig({ METRICS_ENABLED: true }))

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
			setPerformanceConfig(createTestConfig({ METRICS_ENABLED: false }))

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
