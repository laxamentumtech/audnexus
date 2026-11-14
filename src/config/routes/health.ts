import { FastifyInstance } from 'fastify'

/**
 * Timeout duration in milliseconds for health check pings
 */
const PING_TIMEOUT_MS = 5000

/**
 * Wraps a promise with a timeout, clearing the timer when the promise settles
 */
function withTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
	let timer: NodeJS.Timeout
	const timeoutPromise = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reject(new Error(`${operation} timed out after ${PING_TIMEOUT_MS}ms`))
		}, PING_TIMEOUT_MS)
	})

	return Promise.race([promise, timeoutPromise]).finally(() => {
		clearTimeout(timer)
	}) as Promise<T>
}

/**
 * Health check response structure
 */
export interface HealthCheckResponse {
	status: 'healthy' | 'unhealthy'
	timestamp: string
	checks: {
		server: boolean
		database: boolean
		redis: boolean | null
	}
}

/**
 * Health check route for monitoring service health
 * Checks server, database, and optionally Redis connectivity
 */
async function health(app: FastifyInstance) {
	app.get<{ Reply: HealthCheckResponse }>('/health', async (request, reply) => {
		const checks = {
			server: true,
			database: false,
			redis: null as boolean | null
		}

		// Check server (always passes if the route is executing)

		// Check MongoDB with timeout (only if mongoClient is available)
		const mongoClient = app.mongoClient
		if (mongoClient) {
			try {
				await withTimeout(mongoClient.db().command({ ping: 1 }), 'MongoDB ping')
				checks.database = true
			} catch (error) {
				checks.database = false
				request.log.error({ err: error }, 'MongoDB health check failed')
			}
		}

		// The response keeps its single `redis` field, but health requires every
		// configured role (document cache and durable control state) to respond.
		const cacheRedis: { ping: () => Promise<string> } | undefined = app.redis
		const { controlRedis } = app
		const redisRoles: Array<[string, { ping: () => Promise<string> }]> = []
		if (cacheRedis) redisRoles.push(['cache Redis', cacheRedis])
		if (controlRedis) redisRoles.push(['control Redis', controlRedis])
		if (redisRoles.length > 0) {
			const roleResults = await Promise.all(
				redisRoles.map(async ([name, client]) => {
					try {
						await withTimeout(client.ping(), `${name} ping`)
						return true
					} catch (error) {
						request.log.error({ err: error }, `${name} health check failed`)
						return false
					}
				})
			)
			checks.redis = roleResults.every(Boolean)
		}

		// Determine overall status
		const isHealthy = checks.database && (checks.redis === null || checks.redis)

		// Set status code based on health
		const statusCode = isHealthy ? 200 : 503

		const response: HealthCheckResponse = {
			status: isHealthy ? 'healthy' : 'unhealthy',
			timestamp: new Date().toISOString(),
			checks
		}

		return reply.status(statusCode).send(response)
	})
}

export default health
