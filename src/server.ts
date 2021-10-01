// Book routes
import showBook from './config/routes/books/show'
import deleteBook from './config/routes/books/delete'
import showChapter from './config/routes/books/chapters/show'
// Author routes
import showAuthor from './config/routes/authors/show'
// System imports
import { fastify } from 'fastify'
import { connect, disconnect } from './config/papr'

// Heroku or local port
const host = '0.0.0.0'
const port = process.env.PORT || 3000
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1'
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

server.register(require('fastify-redis'), { url: REDIS_URL })

server.listen(port, host, async (err, address) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    await connect()
    console.log(`Server listening at ${address}`)
})

const startGracefulShutdown = () => {
    console.log('Closing http server.')
    server.close(() => {
        console.log('Http server closed.')
        //   Close Papr/mongo connection
        disconnect().then(() => {
            console.log('DB connection closed')
            process.exit(0)
        })
    })
}

process.on('SIGTERM', startGracefulShutdown)
process.on('SIGINT', startGracefulShutdown)
