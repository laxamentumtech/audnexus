import cors from '@fastify/cors'
import redis from '@fastify/redis'
import { fastify } from 'fastify'

import 'module-alias/register'

import { Context, createDefaultContext } from '#config/context'
import { initialize } from '#config/papr'
import deleteAuthor from '#config/routes/authors/delete'
import searchAuthor from '#config/routes/authors/search/show'
import showAuthor from '#config/routes/authors/show'
import showChapter from '#config/routes/books/chapters/show'
import deleteBook from '#config/routes/books/delete'
import showBook from '#config/routes/books/show'

// Heroku or local port
const host = '0.0.0.0'
const port = Number(process.env.PORT) || 3000
const server = fastify({
	logger: {
		level: 'warn'
	}
})

// Register book routes
server.register(showBook)
server.register(showChapter)
server.register(deleteBook)
// Register author routes
server.register(showAuthor)
server.register(deleteAuthor)
server.register(searchAuthor)

// Register redis if it's present
if (process.env.REDIS_URL) {
	console.log('Using Redis')
	server.register(redis, { url: process.env.REDIS_URL })
}

// Setup DB context
if (!process.env.MONGODB_URI) {
	throw new Error('No MongoDB URI specified')
}
const ctx: Context = createDefaultContext(process.env.MONGODB_URI)

// CORS
server.register(cors, {
	origin: true
})

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

const startGracefulShutdown = () => {
	console.log('Closing HTTP server')
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

process.on('SIGTERM', startGracefulShutdown)
process.on('SIGINT', startGracefulShutdown)
