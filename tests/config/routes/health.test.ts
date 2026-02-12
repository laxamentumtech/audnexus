import type { FastifyInstance } from 'fastify'
import { mockDeep } from 'jest-mock-extended'
import { MongoClient } from 'mongodb'

import health, { HealthCheckResponse } from '#config/routes/health'

// Mock the MongoClient
jest.mock('mongodb', () => ({
	MongoClient: jest.fn().mockImplementation(() => ({
		connect: jest.fn().mockResolvedValue(undefined),
		db: jest.fn().mockReturnValue({
			command: jest.fn()
		}),
		close: jest.fn().mockResolvedValue(undefined)
	}))
}))

describe('health route should', () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let app: any
	let mockMongoClient: MongoClient
	let originalMongoUri: string | undefined

	// Shared mock request factory
	const createMockRequest = () => ({
		log: {
			error: jest.fn(),
			info: jest.fn(),
			debug: jest.fn(),
			warn: jest.fn()
		}
	})

	beforeEach(() => {
		// Save original MONGODB_URI to prevent environment variable leaks
		originalMongoUri = process.env.MONGODB_URI

		// Create a deep mock of FastifyInstance
		app = mockDeep<FastifyInstance>()

		// Create mock MongoClient
		mockMongoClient = {
			connect: jest.fn().mockResolvedValue(undefined),
			db: jest.fn().mockReturnValue({
				command: jest.fn()
			}),
			close: jest.fn().mockResolvedValue(undefined)
		} as unknown as MongoClient

		// Attach mongoClient to app
		app.mongoClient = mockMongoClient

		// Mock reply.send and reply.status
		const mockReply = {
			status: jest.fn().mockReturnThis(),
			send: jest.fn().mockReturnThis()
		}
		app.reply = mockReply
	})

	afterEach(() => {
		jest.clearAllMocks()
		// Restore original MONGODB_URI to prevent environment variable leaks
		if (originalMongoUri === undefined) {
			delete process.env.MONGODB_URI
		} else {
			process.env.MONGODB_URI = originalMongoUri
		}
	})

	test('return 200 and healthy status when all services are up', async () => {
		// Mock MongoDB ping success
		;(mockMongoClient.db().command as jest.Mock).mockResolvedValue({ ok: 1 })

		// Mock Redis ping success
		app.redis = {
			ping: jest.fn().mockResolvedValue('PONG')
		}

		// Register health route
		await health(app)

		// Get the route handler
		const routeHandler = (app.get as jest.Mock).mock.calls[0][1]

		// Create mock request and reply
		const mockRequest = createMockRequest()
		const mockReply = {
			status: jest.fn().mockReturnThis(),
			send: jest.fn().mockImplementation((data: HealthCheckResponse) => {
				// Verify the response structure
				expect(data.status).toBe('healthy')
				expect(data.checks.server).toBe(true)
				expect(data.checks.database).toBe(true)
				expect(data.checks.redis).toBe(true)
				expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
				return mockReply
			})
		}

		// Call the route handler
		await routeHandler(mockRequest, mockReply)

		// Verify reply.status was called with 200
		expect(mockReply.status).toHaveBeenCalledWith(200)
	})

	test('return 503 and unhealthy status when MongoDB is down', async () => {
		// Mock MongoDB ping failure
		;(mockMongoClient.db().command as jest.Mock).mockRejectedValue(
			new Error('MongoDB connection failed')
		)

		// Mock Redis ping success
		app.redis = {
			ping: jest.fn().mockResolvedValue('PONG')
		}

		// Register health route
		await health(app)

		// Get the route handler
		const routeHandler = (app.get as jest.Mock).mock.calls[0][1]

		// Create mock request and reply
		const mockRequest = createMockRequest()
		const mockReply = {
			status: jest.fn().mockReturnThis(),
			send: jest.fn().mockImplementation((data: HealthCheckResponse) => {
				// Verify the response structure
				expect(data.status).toBe('unhealthy')
				expect(data.checks.server).toBe(true)
				expect(data.checks.database).toBe(false)
				expect(data.checks.redis).toBe(true)
				expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
				return mockReply
			})
		}

		// Call the route handler
		await routeHandler(mockRequest, mockReply)

		// Verify reply.status was called with 503
		expect(mockReply.status).toHaveBeenCalledWith(503)
	})

	test('return 503 and unhealthy status when Redis is down', async () => {
		// Mock MongoDB ping success
		;(mockMongoClient.db().command as jest.Mock).mockResolvedValue({ ok: 1 })

		// Mock Redis ping failure
		app.redis = {
			ping: jest.fn().mockRejectedValue(new Error('Redis connection failed'))
		}

		// Register health route
		await health(app)

		// Get the route handler
		const routeHandler = (app.get as jest.Mock).mock.calls[0][1]

		// Create mock request and reply
		const mockRequest = createMockRequest()
		const mockReply = {
			status: jest.fn().mockReturnThis(),
			send: jest.fn().mockImplementation((data: HealthCheckResponse) => {
				// Verify the response structure
				expect(data.status).toBe('unhealthy')
				expect(data.checks.server).toBe(true)
				expect(data.checks.database).toBe(true)
				expect(data.checks.redis).toBe(false)
				expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
				return mockReply
			})
		}

		// Call the route handler
		await routeHandler(mockRequest, mockReply)

		// Verify reply.status was called with 503
		expect(mockReply.status).toHaveBeenCalledWith(503)
	})

	test('return 503 and unhealthy status when both MongoDB and Redis are down', async () => {
		// Mock MongoDB ping failure
		;(mockMongoClient.db().command as jest.Mock).mockRejectedValue(
			new Error('MongoDB connection failed')
		)

		// Mock Redis ping failure
		app.redis = {
			ping: jest.fn().mockRejectedValue(new Error('Redis connection failed'))
		}

		// Register health route
		await health(app)

		// Get the route handler
		const routeHandler = (app.get as jest.Mock).mock.calls[0][1]

		// Create mock request and reply
		const mockRequest = createMockRequest()
		const mockReply = {
			status: jest.fn().mockReturnThis(),
			send: jest.fn().mockImplementation((data: HealthCheckResponse) => {
				// Verify the response structure
				expect(data.status).toBe('unhealthy')
				expect(data.checks.server).toBe(true)
				expect(data.checks.database).toBe(false)
				expect(data.checks.redis).toBe(false)
				expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
				return mockReply
			})
		}

		// Call the route handler
		await routeHandler(mockRequest, mockReply)

		// Verify reply.status was called with 503
		expect(mockReply.status).toHaveBeenCalledWith(503)
	})

	test('return 200 and redis as null when Redis is not registered', async () => {
		// Mock MongoDB ping success
		;(mockMongoClient.db().command as jest.Mock).mockResolvedValue({ ok: 1 })

		// Redis not registered
		app.redis = undefined

		// Register health route
		await health(app)

		// Get the route handler
		const routeHandler = (app.get as jest.Mock).mock.calls[0][1]

		// Create mock request and reply
		const mockRequest = createMockRequest()
		const mockReply = {
			status: jest.fn().mockReturnThis(),
			send: jest.fn().mockImplementation((data: HealthCheckResponse) => {
				// Verify the response structure
				expect(data.status).toBe('healthy')
				expect(data.checks.server).toBe(true)
				expect(data.checks.database).toBe(true)
				expect(data.checks.redis).toBeNull()
				expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
				return mockReply
			})
		}

		// Call the route handler
		await routeHandler(mockRequest, mockReply)

		// Verify reply.status was called with 200
		expect(mockReply.status).toHaveBeenCalledWith(200)
	})

	test('verify response structure has all required fields', async () => {
		// Mock all services healthy
		;(mockMongoClient.db().command as jest.Mock).mockResolvedValue({ ok: 1 })
		app.redis = {
			ping: jest.fn().mockResolvedValue('PONG')
		}

		// Register health route
		await health(app)

		// Get the route handler
		const routeHandler = (app.get as jest.Mock).mock.calls[0][1]

		// Create mock request and reply
		const mockRequest = createMockRequest()
		let capturedData: HealthCheckResponse | null = null
		const mockReply = {
			status: jest.fn().mockReturnThis(),
			send: jest.fn().mockImplementation((data: HealthCheckResponse) => {
				capturedData = data
				return mockReply
			})
		}

		// Call the route handler
		await routeHandler(mockRequest, mockReply)

		// Verify all required fields exist
		expect(capturedData).toHaveProperty('status')
		expect(capturedData).toHaveProperty('timestamp')
		expect(capturedData).toHaveProperty('checks')
		expect(capturedData!.checks).toHaveProperty('server')
		expect(capturedData!.checks).toHaveProperty('database')
		expect(capturedData!.checks).toHaveProperty('redis')

		// Verify types
		expect(typeof capturedData!.status).toBe('string')
		expect(typeof capturedData!.timestamp).toBe('string')
		expect(typeof capturedData!.checks.server).toBe('boolean')
		expect(typeof capturedData!.checks.database).toBe('boolean')
		expect(
			capturedData!.checks.redis === null || typeof capturedData!.checks.redis === 'boolean'
		).toBe(true)
	})

	test('verify timestamp is valid ISO format', async () => {
		// Mock all services healthy
		;(mockMongoClient.db().command as jest.Mock).mockResolvedValue({ ok: 1 })
		app.redis = {
			ping: jest.fn().mockResolvedValue('PONG')
		}

		// Register health route
		await health(app)

		// Get the route handler
		const routeHandler = (app.get as jest.Mock).mock.calls[0][1]

		// Create mock request and reply
		const mockRequest = createMockRequest()
		let capturedData: HealthCheckResponse | null = null
		const mockReply = {
			status: jest.fn().mockReturnThis(),
			send: jest.fn().mockImplementation((data: HealthCheckResponse) => {
				capturedData = data
				return mockReply
			})
		}

		// Call the route handler
		await routeHandler(mockRequest, mockReply)

		// Verify timestamp is valid ISO 8601 format
		const timestamp = new Date(capturedData!.timestamp)
		expect(timestamp).toBeInstanceOf(Date)
		expect(isNaN(timestamp.getTime())).toBe(false)
		expect(capturedData!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
	})
})
