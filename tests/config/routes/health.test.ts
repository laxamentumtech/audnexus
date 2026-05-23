import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { MongoClient } from 'mongodb'

import health, { HealthCheckResponse } from '#config/routes/health'

const mockMongoConnect = mock()
const mockMongoDb = mock()
const mockMongoCommand = mock()
const mockMongoClose = mock()

mock.module('mongodb', () => ({
	MongoClient: class MockMongoClient {
		connect = mockMongoConnect
		db = mockMongoDb
		close = mockMongoClose
	}
}))

describe('health route should', () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let app: any
	let mockMongoClient: MongoClient
	let originalMongoUri: string | undefined

	const createMockRequest = () => ({
		log: {
			error: mock(),
			info: mock(),
			debug: mock(),
			warn: mock()
		}
	})

	beforeEach(() => {
		originalMongoUri = process.env.MONGODB_URI

		app = {
			get: mock(),
			mongoClient: null,
			redis: null,
			reply: null
		}

		mockMongoConnect.mockResolvedValue(undefined)
		mockMongoCommand.mockResolvedValue({ ok: 1 })
		mockMongoClose.mockResolvedValue(undefined)

		mockMongoClient = {
			connect: mockMongoConnect,
			db: mockMongoDb,
			close: mockMongoClose
		} as unknown as MongoClient

		app.mongoClient = mockMongoClient

		const mockReply = {
			status: mock(() => mockReply),
			send: mock(() => mockReply)
		}
		app.reply = mockReply
	})

	afterEach(() => {
		mock.clearAllMocks()
		if (originalMongoUri === undefined) {
			delete process.env.MONGODB_URI
		} else {
			process.env.MONGODB_URI = originalMongoUri
		}
	})

	test('return 200 and healthy status when all services are up', async () => {
		mockMongoDb.mockReturnValue({
			command: mockMongoCommand
		})
		mockMongoCommand.mockResolvedValue({ ok: 1 })

		app.redis = {
			ping: mock().mockResolvedValue('PONG')
		}

		await health(app)

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const routeHandler = (app.get as any).mock.calls[0][1]

		const mockRequest = createMockRequest()
		const mockReply = {
			status: mock(() => mockReply),
			send: mock().mockImplementation((data: HealthCheckResponse) => {
				expect(data.status).toBe('healthy')
				expect(data.checks.server).toBe(true)
				expect(data.checks.database).toBe(true)
				expect(data.checks.redis).toBe(true)
				expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
				return mockReply
			})
		}

		await routeHandler(mockRequest, mockReply)

		expect(mockReply.status).toHaveBeenCalledWith(200)
	})

	test('return 503 and unhealthy status when MongoDB is down', async () => {
		mockMongoDb.mockReturnValue({
			command: mockMongoCommand
		})
		mockMongoCommand.mockRejectedValue(new Error('MongoDB connection failed'))

		app.redis = {
			ping: mock().mockResolvedValue('PONG')
		}

		await health(app)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const routeHandler = (app.get as any).mock.calls[0][1]


		const mockRequest = createMockRequest()
		const mockReply = {
			status: mock(() => mockReply),
			send: mock().mockImplementation((data: HealthCheckResponse) => {
				expect(data.status).toBe('unhealthy')
				expect(data.checks.server).toBe(true)
				expect(data.checks.database).toBe(false)
				expect(data.checks.redis).toBe(true)
				expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
				return mockReply
			})
		}

		await routeHandler(mockRequest, mockReply)

		expect(mockReply.status).toHaveBeenCalledWith(503)
	})

	test('return 503 and unhealthy status when Redis is down', async () => {
		mockMongoDb.mockReturnValue({
			command: mockMongoCommand
		})
		mockMongoCommand.mockResolvedValue({ ok: 1 })

		app.redis = {
			ping: mock().mockRejectedValue(new Error('Redis connection failed'))
		}

		await health(app)

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const routeHandler = (app.get as any).mock.calls[0][1]

		const mockRequest = createMockRequest()
		const mockReply = {
			status: mock(() => mockReply),
			send: mock().mockImplementation((data: HealthCheckResponse) => {
				expect(data.status).toBe('unhealthy')
				expect(data.checks.server).toBe(true)
				expect(data.checks.database).toBe(true)
				expect(data.checks.redis).toBe(false)
				expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
				return mockReply
			})
		}

		await routeHandler(mockRequest, mockReply)

		expect(mockReply.status).toHaveBeenCalledWith(503)
	})

	test('return 503 and unhealthy status when both MongoDB and Redis are down', async () => {
		mockMongoDb.mockReturnValue({
			command: mockMongoCommand
		})
		mockMongoCommand.mockRejectedValue(new Error('MongoDB connection failed'))

		app.redis = {
			ping: mock().mockRejectedValue(new Error('Redis connection failed'))
		}

		await health(app)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const routeHandler = (app.get as any).mock.calls[0][1]

		const mockRequest = createMockRequest()
		const mockReply = {
			status: mock(() => mockReply),
			send: mock().mockImplementation((data: HealthCheckResponse) => {
				expect(data.status).toBe('unhealthy')
				expect(data.checks.server).toBe(true)
				expect(data.checks.database).toBe(false)
				expect(data.checks.redis).toBe(false)
				expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
				return mockReply
			})
		}

		await routeHandler(mockRequest, mockReply)

		expect(mockReply.status).toHaveBeenCalledWith(503)
	})

	test('return 200 and redis as null when Redis is not registered', async () => {
		mockMongoDb.mockReturnValue({
			command: mockMongoCommand
		})
		mockMongoCommand.mockResolvedValue({ ok: 1 })

		app.redis = undefined
		await health(app)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const routeHandler = (app.get as any).mock.calls[0][1]


		const mockRequest = createMockRequest()
		const mockReply = {
			status: mock(() => mockReply),
			send: mock().mockImplementation((data: HealthCheckResponse) => {
				expect(data.status).toBe('healthy')
				expect(data.checks.server).toBe(true)
				expect(data.checks.database).toBe(true)
				expect(data.checks.redis).toBeNull()
				expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
				return mockReply
			})
		}

		await routeHandler(mockRequest, mockReply)

		expect(mockReply.status).toHaveBeenCalledWith(200)
	})

	test('verify response structure has all required fields', async () => {
		mockMongoDb.mockReturnValue({
			command: mockMongoCommand
		})
		mockMongoCommand.mockResolvedValue({ ok: 1 })
		app.redis = {
			ping: mock().mockResolvedValue('PONG')
		}

		await health(app)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const routeHandler = (app.get as any).mock.calls[0][1]

		const mockRequest = createMockRequest()
		let capturedData: HealthCheckResponse | null = null
		const mockReply = {
			status: mock(() => mockReply),
			send: mock().mockImplementation((data: HealthCheckResponse) => {
				capturedData = data
				return mockReply
			})
		}

		await routeHandler(mockRequest, mockReply)

		expect(capturedData).toHaveProperty('status')
		expect(capturedData).toHaveProperty('timestamp')
		expect(capturedData).toHaveProperty('checks')
		expect(capturedData!.checks).toHaveProperty('server')
		expect(capturedData!.checks).toHaveProperty('database')
		expect(capturedData!.checks).toHaveProperty('redis')

		expect(typeof capturedData!.status).toBe('string')
		expect(typeof capturedData!.timestamp).toBe('string')
		expect(typeof capturedData!.checks.server).toBe('boolean')
		expect(typeof capturedData!.checks.database).toBe('boolean')
		expect(
			capturedData!.checks.redis === null || typeof capturedData!.checks.redis === 'boolean'
		).toBe(true)
	})

	test('verify timestamp is valid ISO format', async () => {
		mockMongoDb.mockReturnValue({
			command: mockMongoCommand
		})
		mockMongoCommand.mockResolvedValue({ ok: 1 })
		app.redis = {
			ping: mock().mockResolvedValue('PONG')
		}

		await health(app)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const routeHandler = (app.get as any).mock.calls[0][1]

		const mockRequest = createMockRequest()
		let capturedData: HealthCheckResponse | null = null
		const mockReply = {
			status: mock(() => mockReply),
			send: mock().mockImplementation((data: HealthCheckResponse) => {
				capturedData = data
				return mockReply
			})
		}

		await routeHandler(mockRequest, mockReply)

		const timestamp = new Date(capturedData!.timestamp)
		expect(timestamp).toBeInstanceOf(Date)
		expect(isNaN(timestamp.getTime())).toBe(false)
		expect(capturedData!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
	})
})

afterAll(() => {
	mock.restore()
})
