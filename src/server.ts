import { fastify } from 'fastify'
import bookRoute from './config/routes/books'
import { connect } from './config/papr'

// Heroku or local port
const Port = process.env.PORT || 3000
const host = '0.0.0.0'
const server = fastify({
    logger: true
})

server.register(bookRoute)

server.listen(Port, host, async (err, address) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    await connect()
    console.log(`Server listening at ${address}`)
})
