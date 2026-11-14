import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import redis from '@fastify/redis'
import { fastify, type FastifyBaseLogger } from 'fastify'
import { Redis as IORedis } from 'ioredis'
import ipRangeCheck from 'ip-range-check'
import { MongoClient } from 'mongodb'

import { isBookHistoryEnabled } from '#config/bookHistory'
import { Context, createDefaultContext } from '#config/context'
import { registerApiErrorHandler } from '#config/errorHandler'
import { bookHistoryStore, initialize } from '#config/papr'
import { registerPerformanceHooks } from '#config/performance/hooks'
import { createRateLimitRedis, getCacheRedisUrl } from '#config/redis'
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
import { closeQueue, getCacheRedis, getUpdateSchedulerIntervals } from '#helpers/jobs/bullmq'
import { registerUpdateScheduler } from '#helpers/jobs/schedule'
import { getAllIps as getCloudflareIps } from '#helpers/utils/cloudflareIps'
import {
	closeServerWithTimeout,
	createServerDrain,
	type ServerDrain
} from '#helpers/utils/httpShutdown'
import {
	closeWithTimeout,
	remainingShutdownBudget,
	startShutdownBudget
} from '#helpers/utils/shutdownBudget'

// Extend FastifyInstance with its MongoDB and control-Redis health clients.
declare module 'fastify' {
	interface FastifyInstance {
		mongoClient?: MongoClient
		controlRedis?: IORedis
	}
}

let rateLimitRedis: IORedis | null = null
let serverDrain: ServerDrain | null = null

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
	// Fastify's default Redis is only for disposable document-cache routes.
	// The plugin is handed the SHARED bounded cache client (getCacheRedis)
	// rather than letting it create its own: the plugin's built-in close hook
	// would quit its own client with an UNBOUNDED quit() inside server.close(),
	// which a blackholed cache socket can hang past the 10s stop grace. On a
	// supplied `client` the plugin registers no close hook, so the cache
	// client is closed — under the shutdown budget, like every other owned
	// client — by closeQueue in stopServer. The document-cache role (bounded
	// retries, capped reconnect, evictable) is unchanged; the update-scheduler
	// and health route already use this same client.
	const cacheUrl = getCacheRedisUrl()
	if (cacheUrl) {
		server.log.info('Using document-cache Redis')
		await server.register(redis, {
			client: getCacheRedis()
		})
	}

	// Rate limits are control state and must never share the evictable cache.
	rateLimitRedis = createRateLimitRedis()
	if (rateLimitRedis) {
		rateLimitRedis.on('error', (err) =>
			server.log.warn({ err }, 'Rate-limit Redis connection error')
		)
		server.controlRedis = rateLimitRedis
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
		redis: rateLimitRedis ?? undefined,
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
export async function startServer() {
	// Build trusted proxies list (includes Cloudflare IPs)
	trustedProxies = await buildTrustedProxies()

	// Initialize fastify server with trusted proxies
	server = fastify({
		logger: {
			level: logLevel
		},
		trustProxy: trustedProxies
	})

	// Track accepted sockets from the start so the shutdown drain can force-
	// close them; the tracker releases everything when the server closes.
	serverDrain = createServerDrain(server.server)

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
	await registerUpdateScheduler(getUpdateSchedulerIntervals(), server.log)

	// Start main server
	try {
		const address = await server.listen({ port, host })
		server.log.info(`Server listening at ${address}`)
	} catch (err) {
		server.log.error(err)
		process.exit(1)
	}
}

/** Bounded HTTP drain under the shared shutdown budget: the listener stops
 * accepting, and the drain settles when every in-flight request has
 * FINISHED — its response delivered (`res` finish), not when idle keep-
 * alive sockets close, so a healthy response does not burn the budget. On
 * the deadline the tracked sockets are force-destroyed (a stalled request's
 * in-flight queue job is reaped at the next boot), so a stalled request
 * cannot push the queue/Redis closes — and the Mongo close they gate — past
 * the container stop grace. The force is the tracked-socket drain, NOT
 * server.closeAllConnections(): on Bun 1.4.0 that native call is a no-op
 * once close() has started (native handle cleared), and on the same runtime
 * close() settles WITHOUT waiting for in-flight requests — so request-
 * completion tracking is the portable drain-complete signal. */
function closeHttpServer(): Promise<void> {
	const drain = serverDrain
	const drained = drain?.done() ?? Promise.resolve()
	// Fastify v5's close() rejects when an onClose hook throws; observing
	// the promise keeps that failure logged instead of an unhandled
	// rejection. The bounded drain stays authoritative for the budget: the
	// tracked-request race decides when shutdown proceeds, and a stalled
	// close() cannot stall it — it is only OBSERVED here.
	const closed = server.close()
	closed.catch((err: unknown) => server.log.error(err))
	return closeServerWithTimeout(
		drained,
		() => {
			server.log.warn('HTTP drain hit the shutdown deadline; force-closing connections')
			drain?.forceClose()
		},
		remainingShutdownBudget()
	)
}

let shuttingDown: Promise<void> | null = null

/**
 * Shuts down the server and closes the DB connection
 */
async function doStopServer(): Promise<void> {
	if (!server) {
		process.exit(0)
	}
	server.log.info('Closing HTTP server')
	try {
		// ONE aggregate wall-clock budget across every remaining close —
		// the HTTP drain, the queue/Redis closes, and the rate-limit quit —
		// so the sequential per-close deadlines cannot multiply past it and
		// push the Mongo close past the 10s Docker stop grace. The Mongo
		// close itself runs on whatever is left (its own duration is not
		// budgeted); the guarantee is that it is REACHED before the grace.
		startShutdownBudget()
		await closeHttpServer()
		server.log.info('HTTP server closed')
		// Bounded: a queue client blocked behind an offline command must not
		// prevent the Mongo close and process exit below. closeQueue draws
		// its three per-close deadlines from the budget REMAINING after the
		// HTTP drain, and the rate-limit quit below draws from what is left
		// after that. The remainder is forwarded explicitly: a deadline the
		// drain consumed in full would otherwise read as "no budget" and
		// closeQueue would start a fresh SHUTDOWN_REDIS_BUDGET_MS on top of
		// the spent one — exactly the exhausted-budget case the worker
		// guards (src/worker.ts).
		await closeQueue({ budgetMs: remainingShutdownBudget() })
		if (rateLimitRedis) {
			// quit() is queued behind pending offline commands; bound it with
			// the REMAINING aggregate budget so a blackholed rate-limit client
			// cannot block SIGTERM handling.
			await closeWithTimeout(
				() => rateLimitRedis!.quit(),
				() => rateLimitRedis!.disconnect(),
				'rate-limit Redis',
				remainingShutdownBudget()
			)
			rateLimitRedis = null
		}
		// Close Papr/mongo connection
		await ctx.client.close()
		server.log.info('DB connection closed')
		process.exit(0)
	} catch (err) {
		server.log.error(err)
		process.exit(1)
	} finally {
		// Teardown is done (success or failure): clear the single-flight
		// guard so a later call starts fresh. In production process.exit(0)
		// terminates the process immediately after, making the reset
		// unreachable; where exit is stubbed (tests) it lets each call
		// exercise a full teardown (the same reset as src/worker.ts).
		shuttingDown = null
	}
}

/** Single-flight entry for the signal handlers: a second SIGTERM/SIGINT
 * during teardown must not re-call the teardown — it would re-arm the
 * shutdown budget and double-close the queue/Redis clients. The in-flight
 * promise is kept (not awaited by the handler) so a failure is logged once
 * and the process exit below still runs. Exported so tests can drive the
 * exact single-flight entry (src/worker.ts does the same with shutdown()). */
export function stopServer(): void {
	if (shuttingDown) return
	shuttingDown = doStopServer()
	shuttingDown.catch((err: unknown) => server.log.error(err))
}

// Auto-execution only when running as the server entry — `bun run serve` →
// `bun run dist/server.js`, or a direct `bun src/server.ts`. Importing this
// module (e.g. tests) executes only the env guard and context creation;
// startup and handler registration (startServer + signal listeners) run
// only under the import.meta.main gate, which is false for any module that
// is imported (dynamically-imported modules under bun test included).
if (import.meta.main) {
	// Start the server
	void startServer()

	// Handle SIGTERM and SIGINT
	process.on('SIGTERM', stopServer)
	process.on('SIGINT', stopServer)
}
