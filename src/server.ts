import { fastify } from "fastify";
import bookRoute from './config/routes/books'

// Heroku or local port
const Port = process.env.PORT || 3000;
const server = fastify({
    logger: true
});

server.register(bookRoute)

server.listen(Port, (err, address) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Server listening at ${address}`);
});
