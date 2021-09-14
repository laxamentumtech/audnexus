import { fastify } from 'fastify'
import showBook from './config/routes/books/show'
import deleteBook from './config/routes/books/delete'
import { connect } from './config/papr'

// Heroku or local port
const Port = process.env.PORT || 3000
const host = '0.0.0.0'
const server = fastify({
    logger: {
        level: 'warn'
    }
})

server.register(showBook)
server.register(deleteBook)

server.listen(Port, host, async (err, address) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    await connect()
    console.log(`Server listening at ${address}`)
})
