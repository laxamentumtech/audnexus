import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import redis from '@fastify/redis'
import schedule from '@fastify/schedule'
import { fastify } from 'fastify'

import 'module-alias/register'

import { Context, createDefaultContext } from '#config/context'
import { initialize } from '#config/papr'
import deleteAuthor from '#config/routes/authors/delete'
import searchAuthor from '#config/routes/authors/search/show'
import showAuthor from '#config/routes/authors/show'
import deleteChapter from '#config/routes/books/chapters/delete'
import showChapter from '#config/routes/books/chapters/show'
import deleteBook from '#config/routes/books/delete'
import showBook from '#config/routes/books/show'
import health from '#config/routes/health'
import UpdateScheduler from '#helpers/utils/UpdateScheduler'

// Heroku or local port
const host = '0.0.0.0'
const port = Number(process.env.PORT) || 3000
const server = fastify({
	logger: {
		level: 'warn'
	},
	trustProxy: true
})
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
		console.log('Using Redis')
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
		max: Number(process.env.MAX_REQUESTS) || 100,
		redis: process.env.REDIS_URL ? server.redis : undefined,
		timeWindow: '1 minute'
	})
	// Send 429 if rate limit is reached
	server.setErrorHandler(function (error, _request, reply) {
		if (reply.statusCode === 429) {
			if (error instanceof Error) {
				error.message = 'Rate limit reached. Please try again later.'
			} else {
				console.error('Non-error object in error handler:', error)
			}
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
}

/**
 * Starts the server
 * Should be called after registering plugins and routes
 */
async function startServer() {
	// Register plugins
	await registerPlugins().then(() => console.log('Plugins registered'))

	// Register routes
	await registerRoutes().then(() => console.log('Routes registered'))

	// Start main server
	server.listen({ port: port, host: host }, async (err, address) => {
		if (err) {
			console.error(err)
			process.exit(1)
		}
		initialize({ client: await ctx.client.connect() })
			.then(() => {
				console.log(`Connected to DB`)
			})
			.catch((err) => {
				console.error(err)
				process.exit(1)
			})
		console.log(`Server listening at ${address}`)
	})

	server.ready(() => {
		// test that db is connected
		ctx.client
			.db('papr')
			.command({ ping: 1 })
			.then(() => {
				// Schedule update jobs
				console.log(`Update interval: ${updateInterval} days`)
				const updateScheduler = new UpdateScheduler(updateInterval, server.redis)

				const updateAllJob = updateScheduler.updateAllJob()
				server.scheduler.addLongIntervalJob(updateAllJob)
			})
			.catch((err) => {
				console.error(err)
				process.exit(1)
			})
	})
}

/**
 * Shuts down the server and closes the DB connection
 */
async function stopServer() {
	console.log('Closing HTTP server')
	server.scheduler.stop()
	server.close(() => {
		console.log('HTTP server closed')
		//   Close Papr/mongo connection
		ctx.client
			.close()
			.then(() => {
				console.log('DB connection closed')
				process.exit(0)
			})
			.catch((err) => {
				console.error(err)
				process.exit(1)
			})
	})
}

// Start the server
startServer()

// Handle SIGTERM and SIGINT
process.on('SIGTERM', stopServer)
process.on('SIGINT', stopServer)
