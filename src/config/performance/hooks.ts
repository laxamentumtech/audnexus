import { FastifyInstance } from 'fastify'

import { getPerformanceConfig } from '#config/performance'

export interface RequestMetrics {
	count: number
	duration: number
	min: number
	max: number
	avg: number
}

export interface PerformanceMetrics {
	memory: {
		used: number
		total: number
		external: number
		rss: number
	}
	uptime: number
	requests: Record<string, RequestMetrics>
}

const MS_PER_NS = 1_000_000
const MAX_STORED_DURATIONS = 100

const metricsStore: {
	requestCounts: Map<string, number>
	requestDurations: Map<string, number[]>
} = {
	requestCounts: new Map(),
	requestDurations: new Map()
}

function calculateRequestMetrics(path: string): RequestMetrics | undefined {
	const count = metricsStore.requestCounts.get(path) ?? 0
	if (count === 0) return undefined

	const durations = metricsStore.requestDurations.get(path) ?? []
	if (durations.length === 0) return undefined

	const sum = durations.reduce((a, b) => a + b, 0)
	return {
		count,
		duration: sum,
		min: Math.min(...durations),
		max: Math.max(...durations),
		avg: sum / durations.length
	}
}

function getMemoryMetrics() {
	const usage = process.memoryUsage()
	return {
		used: Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100,
		total: Math.round((usage.heapTotal / 1024 / 1024) * 100) / 100,
		external: Math.round((usage.external / 1024 / 1024) * 100) / 100,
		rss: Math.round((usage.rss / 1024 / 1024) * 100) / 100
	}
}

export function getPerformanceMetrics(): PerformanceMetrics {
	const config = getPerformanceConfig()
	const requests: Record<string, RequestMetrics> = {}

	if (config.METRICS_ENABLED) {
		for (const [path] of metricsStore.requestCounts) {
			const metrics = calculateRequestMetrics(path)
			if (metrics) {
				requests[path] = metrics
			}
		}
	}

	return {
		memory: getMemoryMetrics(),
		uptime: Math.floor(process.uptime()),
		requests
	}
}

export function resetMetrics(): void {
	metricsStore.requestCounts.clear()
	metricsStore.requestDurations.clear()
}

export function registerPerformanceHooks(fastify: FastifyInstance): void {
	const config = getPerformanceConfig()

	if (!config.METRICS_ENABLED) {
		return
	}

	fastify.addHook('onRequest', async (request) => {
		request.performanceStartTime = process.hrtime.bigint()
	})

	fastify.addHook('onResponse', async (request, reply) => {
		if (!request.performanceStartTime) return
		if (reply.statusCode >= 400) return

		const endTime = process.hrtime.bigint()
		const durationMs = Number(endTime - request.performanceStartTime) / MS_PER_NS
		const path = request.routeOptions?.url ?? new URL(request.url, 'http://dummy').pathname

		const currentCount = metricsStore.requestCounts.get(path) ?? 0
		metricsStore.requestCounts.set(path, currentCount + 1)

		const durations = metricsStore.requestDurations.get(path) ?? []
		durations.push(durationMs)
		if (durations.length > MAX_STORED_DURATIONS) {
			durations.shift()
		}
		metricsStore.requestDurations.set(path, durations)

		reply.header('X-Response-Time', `${durationMs.toFixed(2)}ms`)
	})
}

declare module 'fastify' {
	interface FastifyRequest {
		performanceStartTime?: bigint
	}
}

export default { registerPerformanceHooks, getPerformanceMetrics, resetMetrics }
