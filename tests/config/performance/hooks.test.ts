import { beforeEach, describe, expect, it } from 'bun:test'
import Fastify from 'fastify'

import {
	DEFAULT_PERFORMANCE_CONFIG,
	PerformanceConfig,
	resetPerformanceConfig,
	setPerformanceConfig
} from '#config/performance'
import {
	getPerformanceMetrics,
	registerPerformanceHooks,
	resetMetrics
} from '#config/performance/hooks'

const createTestConfig = (overrides: Partial<PerformanceConfig>): PerformanceConfig => ({
	...DEFAULT_PERFORMANCE_CONFIG,
	...overrides
})

describe('Performance Hooks', () => {
	beforeEach(() => {
		resetPerformanceConfig()
		resetMetrics()
		setPerformanceConfig(createTestConfig({ METRICS_ENABLED: true }))
	})

	describe('getPerformanceMetrics', () => {
		it('should return memory metrics', () => {
			const metrics = getPerformanceMetrics()

			expect(metrics.memory).toBeDefined()
			expect(metrics.memory.used).toBeGreaterThan(0)
			expect(metrics.memory.total).toBeGreaterThan(0)
			expect(metrics.memory.rss).toBeGreaterThan(0)
		})

		it('should return uptime', () => {
			const metrics = getPerformanceMetrics()

			expect(metrics.uptime).toBeGreaterThanOrEqual(0)
		})

		it('should return empty requests when no requests made', () => {
			const metrics = getPerformanceMetrics()

			expect(metrics.requests).toEqual({})
		})

		it('should not include request metrics when METRICS_ENABLED is false', () => {
			setPerformanceConfig(createTestConfig({ METRICS_ENABLED: false }))

			const metrics = getPerformanceMetrics()
			expect(metrics.requests).toEqual({})
		})
	})

	describe('registerPerformanceHooks', () => {
		it('should execute onResponse hook (metrics tracked)', async () => {
			const fastify = Fastify()
			fastify.get('/test', async () => ({ message: 'ok' }))
			registerPerformanceHooks(fastify)
			await fastify.ready()

			await fastify.inject({
				method: 'GET',
				url: '/test'
			})

			// inject() captures headers before onResponse sets X-Response-Time,
			// so verify the hook ran via the metrics store instead
			const metrics = getPerformanceMetrics()
			expect(metrics.requests['/test']).toBeDefined()
			expect(metrics.requests['/test'].count).toBe(1)
		})

		it('should track request metrics', async () => {
			const fastify = Fastify()
			fastify.get('/test', async () => ({ message: 'ok' }))
			registerPerformanceHooks(fastify)
			await fastify.ready()

			await fastify.inject({
				method: 'GET',
				url: '/test'
			})

			const metrics = getPerformanceMetrics()
			expect(metrics.requests['/test']).toBeDefined()
			expect(metrics.requests['/test'].count).toBe(1)

			await fastify.close()
		})

		it('should track multiple requests', async () => {
			const fastify = Fastify()
			fastify.get('/test', async () => ({ message: 'ok' }))
			registerPerformanceHooks(fastify)
			await fastify.ready()

			await fastify.inject({ method: 'GET', url: '/test' })
			await fastify.inject({ method: 'GET', url: '/test' })
			await fastify.inject({ method: 'GET', url: '/test' })

			const metrics = getPerformanceMetrics()
			expect(metrics.requests['/test'].count).toBe(3)

			await fastify.close()
		})

		it('should track different paths separately', async () => {
			const fastify = Fastify()
			fastify.get('/test1', async () => ({ message: 'ok' }))
			fastify.get('/test2', async () => ({ message: 'ok' }))
			registerPerformanceHooks(fastify)
			await fastify.ready()

			await fastify.inject({ method: 'GET', url: '/test1' })
			await fastify.inject({ method: 'GET', url: '/test2' })

			const metrics = getPerformanceMetrics()
			expect(metrics.requests['/test1'].count).toBe(1)
			expect(metrics.requests['/test2'].count).toBe(1)

			await fastify.close()
		})

		it('should calculate min, max, and avg response times', async () => {
			const fastify = Fastify()
			fastify.get('/test', async () => ({ message: 'ok' }))
			registerPerformanceHooks(fastify)
			await fastify.ready()

			await fastify.inject({ method: 'GET', url: '/test' })
			await fastify.inject({ method: 'GET', url: '/test' })
			await fastify.inject({ method: 'GET', url: '/test' })

			const metrics = getPerformanceMetrics()
			const requestMetrics = metrics.requests['/test']

			expect(requestMetrics.min).toBeGreaterThanOrEqual(0)
			expect(requestMetrics.max).toBeGreaterThanOrEqual(requestMetrics.min)
			expect(requestMetrics.avg).toBeGreaterThanOrEqual(requestMetrics.min)
			expect(requestMetrics.avg).toBeLessThanOrEqual(requestMetrics.max)

			await fastify.close()
		})

		it('should NOT record metrics for 4xx responses', async () => {
			const fastify = Fastify()
			fastify.get('/not-found', async (_, reply) => {
				return reply.status(404).send({ error: 'Not found' })
			})
			registerPerformanceHooks(fastify)
			await fastify.ready()

			await fastify.inject({ method: 'GET', url: '/not-found' })

			const metrics = getPerformanceMetrics()
			expect(metrics.requests['/not-found']).toBeUndefined()

			await fastify.close()
		})

		it('should NOT record metrics for 5xx responses', async () => {
			const fastify = Fastify()
			fastify.get('/server-error', async () => {
				throw new Error('Server error')
			})
			registerPerformanceHooks(fastify)
			await fastify.ready()

			const response = await fastify.inject({ method: 'GET', url: '/server-error' })
			expect(response.statusCode).toBe(500)

			const metrics = getPerformanceMetrics()
			expect(metrics.requests['/server-error']).toBeUndefined()

			await fastify.close()
		})

		it('should NOT record metrics for 400 bad request', async () => {
			const fastify = Fastify()
			fastify.get('/bad-request', async (_, reply) => {
				return reply.status(400).send({ error: 'Bad request' })
			})
			registerPerformanceHooks(fastify)
			await fastify.ready()

			await fastify.inject({ method: 'GET', url: '/bad-request' })

			const metrics = getPerformanceMetrics()
			expect(metrics.requests['/bad-request']).toBeUndefined()

			await fastify.close()
		})

		it('should handle MAX_STORED_DURATIONS limit for request durations', async () => {
			const fastify = Fastify()
			fastify.get('/test', async () => ({ message: 'ok' }))
			registerPerformanceHooks(fastify)
			await fastify.ready()

			// Send 101 requests to trigger MAX_STORED_DURATIONS limit
			for (let i = 0; i < 101; i++) {
				await fastify.inject({ method: 'GET', url: '/test' })
			}

			const metrics = getPerformanceMetrics()
			expect(metrics.requests['/test']).toBeDefined()
			expect(metrics.requests['/test'].count).toBe(101)
			expect(metrics.requests['/test'].min).toBeGreaterThanOrEqual(0)
			expect(metrics.requests['/test'].avg).toBeGreaterThanOrEqual(0)

			await fastify.close()
		})
	})

	describe('resetMetrics', () => {
		it('should clear all metrics', async () => {
			const fastify = Fastify()
			fastify.get('/test', async () => ({ message: 'ok' }))
			registerPerformanceHooks(fastify)
			await fastify.ready()

			await fastify.inject({ method: 'GET', url: '/test' })
			expect(getPerformanceMetrics().requests['/test']).toBeDefined()

			resetMetrics()
			expect(getPerformanceMetrics().requests).toEqual({})

			await fastify.close()
		})
	})

	describe('disabled monitoring', () => {
		it('should not add hooks when METRICS_ENABLED is false', async () => {
			setPerformanceConfig(createTestConfig({ METRICS_ENABLED: false }))

			const disabledFastify = Fastify()
			disabledFastify.get('/test', async () => ({ message: 'ok' }))
			registerPerformanceHooks(disabledFastify)
			await disabledFastify.ready()

			const response = await disabledFastify.inject({
				method: 'GET',
				url: '/test'
			})

			expect(response.headers['x-response-time']).toBeUndefined()

			await disabledFastify.close()
		})
	})
})
