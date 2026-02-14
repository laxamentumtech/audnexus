import Fastify from 'fastify'

import { resetPerformanceConfig, setPerformanceConfig } from '#config/performance'
import {
	getPerformanceMetrics,
	registerPerformanceHooks,
	resetMetrics
} from '#config/performance/hooks'

describe('Performance Hooks', () => {
	beforeEach(() => {
		resetPerformanceConfig()
		resetMetrics()
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
			setPerformanceConfig({
				USE_PARALLEL_SCHEDULER: false,
				USE_CONNECTION_POOLING: true,
				USE_COMPACT_JSON: true,
				USE_SORTED_KEYS: false,
				CIRCUIT_BREAKER_ENABLED: true,
				METRICS_ENABLED: false,
				MAX_CONCURRENT_REQUESTS: 50,
				SCHEDULER_CONCURRENCY: 5
			})

			const metrics = getPerformanceMetrics()
			expect(metrics.requests).toEqual({})
		})
	})

	describe('registerPerformanceHooks', () => {
		it.skip('should add X-Response-Time header', async () => {
			const fastify = Fastify()
			fastify.get('/test', async () => ({ message: 'ok' }))
			registerPerformanceHooks(fastify)
			await fastify.ready()

			const response = await fastify.inject({
				method: 'GET',
				url: '/test'
			})

			const responseTimeHeader =
				response.headers['x-response-time'] || response.headers['X-Response-Time']
			expect(responseTimeHeader).toBeDefined()
			const responseTime = parseFloat(responseTimeHeader as string)
			expect(responseTime).toBeGreaterThanOrEqual(0)

			await fastify.close()
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
			setPerformanceConfig({
				USE_PARALLEL_SCHEDULER: false,
				USE_CONNECTION_POOLING: true,
				USE_COMPACT_JSON: true,
				USE_SORTED_KEYS: false,
				CIRCUIT_BREAKER_ENABLED: true,
				METRICS_ENABLED: false,
				MAX_CONCURRENT_REQUESTS: 50,
				SCHEDULER_CONCURRENCY: 5
			})

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
