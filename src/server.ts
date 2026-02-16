import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import redis from '@fastify/redis'
import schedule from '@fastify/schedule'
import { fastify, FastifyBaseLogger, FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import ipRangeCheck from 'ip-range-check'
import { MongoClient } from 'mongodb'

import 'module-alias/register'

import { Context, createDefaultContext } from '#config/context'
import {
	BadRequestError,
	ContentTypeMismatchError,
	NotFoundError,
	ValidationError
} from '#helpers/errors/ApiErrors'

// Extend FastifyInstance to include mongoClient for health check
declare module 'fastify' {
	interface FastifyInstance {
		mongoClient?: MongoClient
	}
}
import { initialize } from '#config/papr'
import { registerPerformanceHooks } from '#config/performance/hooks'
import deleteAuthor from '#config/routes/authors/delete'
import searchAuthor from '#config/routes/authors/search/show'
import showAuthor from '#config/routes/authors/show'
import deleteChapter from '#config/routes/books/chapters/delete'
import showChapter from '#config/routes/books/chapters/show'
import deleteBook from '#config/routes/books/delete'
import showBook from '#config/routes/books/show'
import health from '#config/routes/health'
import { registerMetricsRoute } from '#config/routes/metrics'
import { getAllIps as getCloudflareIps } from '#helpers/utils/cloudflareIps'
import UpdateScheduler from '#helpers/utils/UpdateScheduler'

// Heroku or local port
const host = process.env.HOST || '0.0.0.0'
const port = Number(process.env.PORT) || 3000
const logLevel = (process.env.LOG_LEVEL as FastifyBaseLogger['level']) || 'info'

// Parse TRUSTED_PROXIES env var for containerized environments (e.g., Traefik)
// Supports comma-separated list of IPs and CIDR ranges, defaults to '127.0.0.1' for backward compatibility
const userTrustedProxies = process.env.TRUSTED_PROXIES
	? process.env.TRUSTED_PROXIES.split(',').map((s) => s.trim())
	: ['127.0.0.1']

/**
 * Build the trusted proxies list by merging user-configured IPs with Cloudflare IPs
 * Removes duplicates and returns a deduplicated array
 */
async function buildTrustedProxies(): Promise<string[]> {
	try {
		const cloudflareIps = await getCloudflareIps()
		// Merge user IPs with Cloudflare IPs, removing duplicates
		return [...new Set([...userTrustedProxies, ...cloudflareIps])]
	} catch (error) {
		// If Cloudflare IP fetch fails, fall back to user-configured IPs only
		console.warn('Failed to fetch Cloudflare IPs', error)
		return userTrustedProxies
	}
}

/**
 * Check if an IP is in the trusted proxies list
 * Supports both exact IP matches and CIDR ranges (e.g., "10.0.0.0/8")
 */
function isTrustedProxy(ip: string, trustedProxiesList: string[]): boolean {
	try {
		return ipRangeCheck(ip, trustedProxiesList)
	} catch {
		// Treat parsing errors as non-match
		return false
	}
}

let trustedProxies: string[] = []
let server: ReturnType<typeof fastify>
const updateInterval = Number(process.env.UPDATE_INTERVAL) || 30

// Setup DB context
if (!process.env.MONGODB_URI) {
	throw new Error('No MongoDB URI specified')
}
const ctx: Context = createDefaultContext(process.env.MONGODB_URI)

/**
 * Registers plugins for the server before booting it up
 * Should be called before registering routes
 */
async function registerPlugins() {
	// Register redis if it's present
	if (process.env.REDIS_URL) {
		server.log.info('Using Redis')
		await server.register(redis, {
			connectTimeout: 500,
			maxRetriesPerRequest: 1,
			url: process.env.REDIS_URL
		})
	}

	// CORS
	await server.register(cors, {
		origin: true
	})

	// Helmet
	await server.register(helmet, {
		global: true
	})

	// Scheduler
	await server.register(schedule)

	// Rate limiting
	await server.register(rateLimit, {
		global: true,
		keyGenerator: (request: { ip: string; headers: { 'x-forwarded-for'?: string | string[] } }) => {
			// Only trust X-Forwarded-For if request comes from a trusted proxy
			if (isTrustedProxy(request.ip, trustedProxies)) {
				const forwardedFor = request.headers['x-forwarded-for']
				if (forwardedFor) {
					const firstIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0]
					if (firstIp?.trim()) {
						return firstIp.trim()
					}
				}
			}
			return request.ip
		},
		max: Number(process.env.MAX_REQUESTS) || 100,
		redis: process.env.REDIS_URL ? server.redis : undefined,
		timeWindow: '1 minute'
	})
	// Send 429 if rate limit is reached
	// Check for custom error status codes (404, 400, etc.)
	server.setErrorHandler(function (
		error: FastifyError,
		request: FastifyRequest,
		reply: FastifyReply
	) {
		const errorCodeMap: Record<string, string> = {
			ContentTypeMismatchError: 'CONTENT_TYPE_MISMATCH',
			ValidationError: 'VALIDATION_ERROR',
			NotFoundError: 'NOT_FOUND',
			BadRequestError: 'BAD_REQUEST'
		}

		if (
			error instanceof ContentTypeMismatchError ||
			error instanceof ValidationError ||
			error instanceof NotFoundError ||
			error instanceof BadRequestError
		) {
			const statusCode = error.statusCode
			const errorCode = error.details?.code || errorCodeMap[error.name] || 'UNKNOWN_ERROR'

			reply.status(statusCode)
			reply.send({
				error: {
					code: errorCode,
					message: error.message,
					details: error.details
				}
			})
			return
		}

		// Check for 429 rate limit errors first
		if (reply.statusCode === 429) {
			if (error instanceof Error) {
				reply.status(429)
				reply.send({
					error: {
						code: 'RATE_LIMIT_EXCEEDED',
						message: 'Rate limit reached. Please try again later.',
						details: null
					}
				})
				return
			} else {
				server.log.error('Non-error object in error handler: %s', String(error))
			}
		}

		// Check if error has a custom statusCode property
		if (error instanceof Error && 'statusCode' in error) {
			const statusCode = (error as Error & { statusCode: number }).statusCode
			const errorCode = String(statusCode || 'UNKNOWN_ERROR')
			reply.status(statusCode)
			reply.send({
				error: {
					code: errorCode,
					message: error.message || 'An error occurred',
					details: null
				}
			})
			return
		}
		reply.send(error)
	})
}

/**
 * Registers routes for the server before booting it up
 * Should be called after registering plugins
 */
async function registerRoutes() {
	await server
		.register(showBook)
		.register(deleteBook)
		.register(showChapter)
		.register(deleteChapter)
		.register(showAuthor)
		.register(deleteAuthor)
		.register(searchAuthor)
		.register(health)

	try {
		registerPerformanceHooks(server)
		registerMetricsRoute(server)
	} catch (err) {
		server.log.warn({ err }, 'Failed to register metrics, continuing without metrics')
	}
}

/**
 * Starts the server
 * Should be called after registering plugins and routes
 */
async function startServer() {
	// Build trusted proxies list (includes Cloudflare IPs)
	trustedProxies = await buildTrustedProxies()

	// Initialize fastify server with trusted proxies
	server = fastify({
		logger: {
			level: logLevel
		},
		trustProxy: trustedProxies
	})

	server.log.info(`Trusted proxies configured: ${trustedProxies.length} ranges`)

	// Register plugins
	await registerPlugins().then(() => server.log.info('Plugins registered'))

	// Register routes
	await registerRoutes().then(() => server.log.info('Routes registered'))
	server.log.info('Registered routes: %s', server.printRoutes())

	// Start main server
	try {
		const address = await server.listen({ port, host })
		await initialize({ client: await ctx.client.connect() })
		server.log.info('Connected to DB')
		server.mongoClient = ctx.client
		server.log.info(`Server listening at ${address}`)
	} catch (err) {
		server.log.error(err)
		process.exit(1)
	}

	server.ready(() => {
		// test that db is connected
		ctx.client
			.db('papr')
			.command({ ping: 1 })
			.then(() => {
				// Schedule update jobs
				server.log.info(`Update interval: ${updateInterval} days`)
				const updateScheduler = new UpdateScheduler(updateInterval, server.redis, server.log)
				;(server as unknown as { updateScheduler: UpdateScheduler }).updateScheduler =
					updateScheduler

				const updateAllJob = updateScheduler.updateAllJob()
				server.scheduler.addLongIntervalJob(updateAllJob)
			})
			.catch((err) => {
				server.log.error(err)
				process.exit(1)
			})
	})
}

/**
 * Shuts down the server and closes the DB connection
 */
async function stopServer() {
	server.log.info('Closing HTTP server')
	server.scheduler.stop()
	try {
		await server.close()
		server.log.info('HTTP server closed')
		// Close Papr/mongo connection
		await ctx.client.close()
		server.log.info('DB connection closed')
		process.exit(0)
	} catch (err) {
		server.log.error(err)
		process.exit(1)
	}
}

// Start the server
startServer()

// Handle SIGTERM and SIGINT
process.on('SIGTERM', stopServer)
process.on('SIGINT', stopServer)
