// Book routes
import showBook from '#routes/books/show'
import deleteBook from '#routes/books/delete'
import showChapter from '#routes/books/chapters/show'
// Author routes
import showAuthor from '#routes/authors/show'
import deleteAuthor from '#routes/authors/delete'
import searchAuthor from '#routes/authors/search/show'
// System imports
import { fastify } from 'fastify'
import { connect, disconnect } from '#papr'

// Heroku or local port
const host = '0.0.0.0'
const port = process.env.PORT || 3000
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
    server.register(require('fastify-redis'), { url: process.env.REDIS_URL })
}
// CORS
server.register(require('fastify-cors'), {
    origin: true
})

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
