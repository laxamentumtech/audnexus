import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import redis from '@fastify/redis'
import { fastify, type FastifyBaseLogger } from 'fastify'
import ipRangeCheck from 'ip-range-check'
import { MongoClient } from 'mongodb'

import { isBookHistoryEnabled } from '#config/bookHistory'
import { Context, createDefaultContext } from '#config/context'
import { registerApiErrorHandler } from '#config/errorHandler'
import { bookHistoryStore, initialize } from '#config/papr'

// Extend FastifyInstance to include mongoClient for health check
declare module 'fastify' {
	interface FastifyInstance {
		mongoClient?: MongoClient
	}
}
import { registerPerformanceHooks } from '#config/performance/hooks'
import deleteAuthor from '#config/routes/authors/delete'
import searchAuthor from '#config/routes/authors/search/show'
import showAuthor from '#config/routes/authors/show'
import bookArtwork from '#config/routes/books/artwork'
import backfillBookRatings from '#config/routes/books/backfill'
import deleteChapter from '#config/routes/books/chapters/delete'
import showChapter from '#config/routes/books/chapters/show'
import deleteBook from '#config/routes/books/delete'
import bookHistory from '#config/routes/books/history'
import bookHistoryDetail from '#config/routes/books/historyDetail'
import searchBook from '#config/routes/books/search/show'
import showBook from '#config/routes/books/show'
import health from '#config/routes/health'
import { registerMetricsRoute } from '#config/routes/metrics'
import { registerUpdateScheduler } from '#helpers/jobs/schedule'
import { getAllIps as getCloudflareIps } from '#helpers/utils/cloudflareIps'

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
	let cloudflareIps: string[] = []
	try {
		cloudflareIps = await getCloudflareIps()
	} catch (err) {
		console.warn('Failed to fetch Cloudflare IPs, using user-configured proxies only:', err)
	}
	// Merge user IPs with Cloudflare IPs, removing duplicates
	return [...new Set([...userTrustedProxies, ...cloudflareIps])]
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
		origin: true,
		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE'
	})

	// Helmet
	await server.register(helmet, {
		global: true
	})

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
	registerApiErrorHandler(server)
}

/**
 * Registers routes for the server before booting it up
 * Should be called after registering plugins
 */
async function registerRoutes() {
	await server
		.register(searchBook)
		.register(showBook)
		.register(deleteBook)
		.register(bookHistory)
		.register(bookHistoryDetail)
		.register(bookArtwork)
		.register(backfillBookRatings)
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

	// Register plugins (rate limiting and the shared structured error
	// handler) before any route can be reached.
	await registerPlugins().then(() => server.log.info('Plugins registered'))

	// Connect/initialize before routes, scheduler registration, and the
	// HTTP listener. An activation-gate or initialization failure must
	// leave no open listener and no scheduled work.
	try {
		await initialize({ client: await ctx.client.connect() })
		// Activation gate: enabled mode refuses to start without a
		// transaction-capable replica set and prepared history indexes.
		if (isBookHistoryEnabled()) await bookHistoryStore.assertHistoryPrerequisites()
		server.log.info('Connected to DB')
	} catch (err) {
		server.log.error(err)
		process.exit(1)
	}
	server.mongoClient = ctx.client

	// Register routes
	await registerRoutes().then(() => server.log.info('Routes registered'))
	server.log.info('Registered routes: %s', server.printRoutes())

	// The update schedule is a BullMQ repeatable job consumed by the worker
	// container (src/worker.ts); the API only (re)creates it at startup.
	await registerUpdateScheduler(updateInterval, server.log)

	// Start main server
	try {
		const address = await server.listen({ port, host })
		server.log.info(`Server listening at ${address}`)
	} catch (err) {
		server.log.error(err)
		process.exit(1)
	}
}

/**
 * Shuts down the server and closes the DB connection
 */
async function stopServer() {
	if (!server) {
		process.exit(0)
	}
	server.log.info('Closing HTTP server')
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
