import { FastifyRequest } from 'fastify'
import Fastify from 'fastify'
import { mock } from 'jest-mock-extended'

import {
	DEFAULT_PERFORMANCE_CONFIG,
	PerformanceConfig,
	setPerformanceConfig
} from '#config/performance'
import { isIpAllowed, parseEnvArray, registerMetricsRoute } from '#config/routes/metrics'

const createTestConfig = (overrides: Partial<PerformanceConfig>): PerformanceConfig => ({
	USE_PARALLEL_SCHEDULER: false,
	USE_CONNECTION_POOLING: true,
	USE_COMPACT_JSON: true,
	USE_SORTED_KEYS: false,
	CIRCUIT_BREAKER_ENABLED: true,
	METRICS_ENABLED: true,
	MAX_CONCURRENT_REQUESTS: 50,
	SCHEDULER_CONCURRENCY: 5,
	SCHEDULER_MAX_PER_REGION: 5,
	DEFAULT_REGION: 'us',
	...overrides
})

describe('Metrics Route - Authentication', () => {
	let originalAuthToken: string | undefined
	let originalAllowedIps: string | undefined

	beforeEach(() => {
		originalAuthToken = process.env.METRICS_AUTH_TOKEN
		originalAllowedIps = process.env.METRICS_ALLOWED_IPS
	})

	afterAll(() => {
		setPerformanceConfig(DEFAULT_PERFORMANCE_CONFIG)
	})

	afterEach(() => {
		if (originalAuthToken === undefined) {
			delete process.env.METRICS_AUTH_TOKEN
		} else {
			process.env.METRICS_AUTH_TOKEN = originalAuthToken
		}
		if (originalAllowedIps === undefined) {
			delete process.env.METRICS_ALLOWED_IPS
		} else {
			process.env.METRICS_ALLOWED_IPS = originalAllowedIps
		}
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

		it('parseEnvArray returns undefined for whitespace-only commas', () => {
			// Test the missing-entries branch: when all entries are whitespace/empty after split
			const result = parseEnvArray(' , ,  ')
			expect(result).toBeUndefined()
		})

		it('parseEnvArray returns undefined for empty string', () => {
			const result = parseEnvArray('')
			expect(result).toBeUndefined()
		})

		it('parseEnvArray returns undefined for only commas', () => {
			const result = parseEnvArray(',,,')
			expect(result).toBeUndefined()
		})

		it('returns 200 when METRICS_ALLOWED_IPS is whitespace-only (triggers fallback)', async () => {
			// When parseEnvArray returns undefined due to empty result, auth fallback should allow access
			process.env.METRICS_ALLOWED_IPS = ' , ,  '
			delete process.env.METRICS_AUTH_TOKEN
			setPerformanceConfig(createTestConfig({ METRICS_ENABLED: true }))

			const fastify = Fastify()
			registerMetricsRoute(fastify)
			await fastify.ready()

			const response = await fastify.inject({
				method: 'GET',
				url: '/metrics'
			})

			// Should return 200 because parseEnvArray returns undefined and no auth token is set
			expect(response.statusCode).toBe(200)
			await fastify.close()
		})

		it('returns 403 when METRICS_ALLOWED_IPS is whitespace-only but METRICS_AUTH_TOKEN is set', async () => {
			// When parseEnvArray returns undefined but auth token is set, should check token
			process.env.METRICS_ALLOWED_IPS = ' , ,  '
			process.env.METRICS_AUTH_TOKEN = 'test-token'
			setPerformanceConfig(createTestConfig({ METRICS_ENABLED: true }))

			const fastify = Fastify()
			registerMetricsRoute(fastify)
			await fastify.ready()

			const response = await fastify.inject({
				method: 'GET',
				url: '/metrics',
				headers: { 'x-metrics-token': 'wrong-token' }
			})

			// Should return 403 because token doesn't match
			expect(response.statusCode).toBe(403)
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

describe('isIpAllowed', () => {
	afterEach(() => {
		delete process.env.METRICS_ALLOWED_IPS
	})

	const createMockRequest = (
		ip: string | undefined,
		forwardedFor: string | string[] | undefined
	): FastifyRequest => {
		const mockReq = mock<FastifyRequest>()
		;(mockReq as unknown as { ip: string | undefined }).ip = ip
		;(mockReq as unknown as { headers: Record<string, string | string[]> }).headers =
			forwardedFor !== undefined ? { 'x-forwarded-for': forwardedFor } : {}
		return mockReq
	}

	describe('x-forwarded-for as array', () => {
		it('returns true when first IP in array is in allowed list', () => {
			const mockRequest = createMockRequest(undefined, ['10.0.0.1', '192.168.1.1'])

			const result = isIpAllowed(mockRequest, ['10.0.0.1', '192.168.1.1'])
			expect(result).toBe(true)
		})

		it('returns false when first IP in array is not in allowed list', () => {
			const mockRequest = createMockRequest(undefined, ['172.16.0.1', '192.168.1.1'])

			const result = isIpAllowed(mockRequest, ['10.0.0.1', '192.168.1.1'])
			expect(result).toBe(false)
		})

		it('uses request.ip when defined, ignoring x-forwarded-for array', () => {
			const mockRequest = createMockRequest('10.0.0.1', ['172.16.0.1', '192.168.1.1'])

			const result = isIpAllowed(mockRequest, ['10.0.0.1', '192.168.1.1'])
			expect(result).toBe(true)
		})
	})

	describe('x-forwarded-for as comma-separated string', () => {
		it('returns true when first IP in string is in allowed list', () => {
			const mockRequest = createMockRequest(undefined, '10.0.0.1, 192.168.1.1')

			const result = isIpAllowed(mockRequest, ['10.0.0.1', '192.168.1.1'])
			expect(result).toBe(true)
		})

		it('returns false when first IP in string is not in allowed list', () => {
			const mockRequest = createMockRequest(undefined, '172.16.0.1, 192.168.1.1')

			const result = isIpAllowed(mockRequest, ['10.0.0.1', '192.168.1.1'])
			expect(result).toBe(false)
		})

		it('trims whitespace from comma-separated string', () => {
			const mockRequest = createMockRequest(undefined, ' 10.0.0.1 , 192.168.1.1 ')

			const result = isIpAllowed(mockRequest, ['10.0.0.1', '192.168.1.1'])
			expect(result).toBe(true)
		})

		it('uses request.ip when defined, ignoring x-forwarded-for string', () => {
			const mockRequest = createMockRequest('10.0.0.1', '172.16.0.1, 192.168.1.1')

			const result = isIpAllowed(mockRequest, ['10.0.0.1', '192.168.1.1'])
			expect(result).toBe(true)
		})
	})

	describe('request.ip is undefined/null', () => {
		it('falls back to firstForwardedIp from array when request.ip is undefined', () => {
			const mockRequest = createMockRequest(undefined, ['10.0.0.1', '192.168.1.1'])

			const result = isIpAllowed(mockRequest, ['10.0.0.1'])
			expect(result).toBe(true)
		})

		it('falls back to firstForwardedIp from string when request.ip is undefined', () => {
			const mockRequest = createMockRequest(undefined, '10.0.0.1, 192.168.1.1')

			const result = isIpAllowed(mockRequest, ['10.0.0.1'])
			expect(result).toBe(true)
		})

		it('returns false when both request.ip and x-forwarded-for are undefined', () => {
			const mockRequest = createMockRequest(undefined, undefined)

			const result = isIpAllowed(mockRequest, ['10.0.0.1'])
			expect(result).toBe(false)
		})

		it('returns false when x-forwarded-for is empty array', () => {
			const mockRequest = createMockRequest(undefined, [])

			const result = isIpAllowed(mockRequest, ['10.0.0.1'])
			expect(result).toBe(false)
		})

		it('returns false when x-forwarded-for is empty string', () => {
			const mockRequest = createMockRequest(undefined, '')

			const result = isIpAllowed(mockRequest, ['10.0.0.1'])
			expect(result).toBe(false)
		})
	})

	describe('IP not in allowed list', () => {
		it('returns false when request.ip is not in allowed list', () => {
			const mockRequest = createMockRequest('172.16.0.1', undefined)

			const result = isIpAllowed(mockRequest, ['10.0.0.1', '192.168.1.1'])
			expect(result).toBe(false)
		})

		it('returns false when x-forwarded-for array IP is not in allowed list', () => {
			const mockRequest = createMockRequest(undefined, ['172.16.0.1', '10.0.0.1'])

			const result = isIpAllowed(mockRequest, ['10.0.0.1'])
			expect(result).toBe(false)
		})

		it('returns false when x-forwarded-for string IP is not in allowed list', () => {
			const mockRequest = createMockRequest(undefined, '172.16.0.1, 10.0.0.1')

			const result = isIpAllowed(mockRequest, ['10.0.0.1'])
			expect(result).toBe(false)
		})
	})

	describe('clientIp usage', () => {
		it('uses request.ip when available', () => {
			const mockRequest = createMockRequest('10.0.0.1', '172.16.0.1')

			const result = isIpAllowed(mockRequest, ['10.0.0.1'])
			expect(result).toBe(true)
		})

		it('uses firstForwardedIp when request.ip is undefined', () => {
			const mockRequest = createMockRequest(undefined, '10.0.0.1')

			const result = isIpAllowed(mockRequest, ['10.0.0.1'])
			expect(result).toBe(true)
		})

		it('defaults to unknown when both request.ip and x-forwarded-for are undefined', () => {
			const mockRequest = createMockRequest(undefined, undefined)

			const result = isIpAllowed(mockRequest, ['unknown'])
			expect(result).toBe(true)
		})
	})

	describe('invalid CIDR/IP handling', () => {
		it('returns false for invalid CIDR format', () => {
			const mockRequest = createMockRequest('10.0.0.1', undefined)
			const result = isIpAllowed(mockRequest, ['invalid-cidr'])
			expect(result).toBe(false)
		})

		it('returns false for malformed CIDR', () => {
			const mockRequest = createMockRequest('192.168.1.1', undefined)
			const result = isIpAllowed(mockRequest, ['192.168.1/24'])
			expect(result).toBe(false)
		})

		it('returns false for non-IP string', () => {
			const mockRequest = createMockRequest('172.16.0.1', undefined)
			const result = isIpAllowed(mockRequest, ['not-a-valid-ip'])
			expect(result).toBe(false)
		})

		it('returns false for various invalid CIDR formats', () => {
			const mockRequest = createMockRequest('10.0.0.1', undefined)

			const invalidInputs = [
				'invalid-cidr',
				'192.168.1/24', // malformed CIDR
				'not-a-valid-ip',
				'999.999.999.999', // invalid IP
				'string/cidr' // non-numeric CIDR
			]

			for (const invalidInput of invalidInputs) {
				const result = isIpAllowed(mockRequest, [invalidInput])
				expect(result).toBe(false)
			}
		})

		it('returns true for valid IP in allowed list', () => {
			const mockRequest = createMockRequest('10.0.0.1', undefined)
			const result = isIpAllowed(mockRequest, ['10.0.0.1'])
			expect(result).toBe(true)
		})
	})
})
