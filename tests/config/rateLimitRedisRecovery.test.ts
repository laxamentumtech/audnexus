// Real-socket regression for the rate-limit client's reconnect behavior.
// This file must not mock the ioredis module: the recovery path is the real
// client reconnecting in place. It relies on the real module being in the
// bun module registry when this file loads — the ioredis-mocking files
// (tests/helpers/jobs/bullmq.test.ts and tests/config/redis.test.ts) each
// re-mock the captured real module in their afterAll, so the real client is
// in place both before this file (bullmq.test.ts runs earlier in the test
// command) and after the sibling redis.test.ts.
import { afterEach, describe, expect, test } from 'bun:test'
import type { Redis } from 'ioredis'
import { once } from 'node:events'
import { createServer, type Server, type Socket } from 'node:net'

import {
	createRateLimitRedis,
	RATE_LIMIT_RETRY_BASE_MS,
	RATE_LIMIT_RETRY_CAP_MS
} from '#config/redis'

const savedRedisUrl = process.env.REDIS_URL
const savedRedisCacheUrl = process.env.REDIS_CACHE_URL

afterEach(() => {
	if (savedRedisUrl === undefined) delete process.env.REDIS_URL
	else process.env.REDIS_URL = savedRedisUrl
	if (savedRedisCacheUrl === undefined) delete process.env.REDIS_CACHE_URL
	else process.env.REDIS_CACHE_URL = savedRedisCacheUrl
})

function decodeRespCommand(input: Buffer): { command: string; consumed: number } | null {
	let cursor = 0
	const readLine = () => {
		const end = input.indexOf('\r\n', cursor)
		if (end < 0) return null
		const line = input.toString('utf8', cursor, end)
		cursor = end + 2
		return line
	}

	const countLine = readLine()
	if (!countLine?.startsWith('*')) return null
	const count = Number(countLine.slice(1))
	let command = ''
	for (let index = 0; index < count; index += 1) {
		const lengthLine = readLine()
		if (!lengthLine?.startsWith('$')) return null
		const length = Number(lengthLine.slice(1))
		if (input.length < cursor + length + 2) return null
		const value = input.toString('utf8', cursor, cursor + length)
		cursor += length + 2
		if (index === 0) command = value.toUpperCase()
	}
	return { command, consumed: cursor }
}

/** Tiny RESP server that answers the ioredis handshake and every command.
 * Accepted sockets are tracked explicitly (mirroring the blackhole sibling):
 * `net.Server` exposes no sockets collection, and `server.close()` alone
 * would block on any accepted connection the client keeps open. */
function startResponder(): Promise<{ server: Server; port: number; commands: string[]; sockets: Set<Socket> }> {
	const commands: string[] = []
	const sockets = new Set<Socket>()
	const server = createServer((socket) => {
		sockets.add(socket)
		socket.on('close', () => sockets.delete(socket))
		let buffered = Buffer.alloc(0)
		socket.on('data', (chunk: Buffer) => {
			buffered = Buffer.concat([buffered, chunk])
			while (true) {
				const decoded = decodeRespCommand(buffered)
				if (!decoded) break
				buffered = buffered.subarray(decoded.consumed)
				commands.push(decoded.command)
				if (decoded.command === 'INFO') {
					const info = '# Server\r\nredis_version:7.0.0\r\n'
					socket.write(`$${Buffer.byteLength(info)}\r\n${info}\r\n`)
				} else if (decoded.command === 'PING') {
					socket.write('+PONG\r\n')
				} else {
					socket.write('+OK\r\n')
				}
			}
		})
	})
	const { promise, resolve } = Promise.withResolvers<{ server: Server; port: number; commands: string[]; sockets: Set<Socket> }>()
	server.listen(0, '127.0.0.1', () => {
		const address = server.address()
		if (!address || typeof address === 'string') throw new Error('Expected a TCP server address')
		resolve({ server, port: address.port, commands, sockets })
	})
	return promise
}

/** Destroy the tracked sockets first so `close()` is guaranteed to finish:
 * the ioredis client holds its socket open until told to disconnect. */
async function stopServer(server: Server, sockets: Set<Socket>): Promise<void> {
	for (const socket of sockets) socket.destroy()
	const { promise: closed, resolve } = Promise.withResolvers<void>()
	server.once('close', () => resolve())
	server.close()
	await closed
}

/** Stop the client without awaiting: `disconnect()` can itself hang if the
 * client is mid-reconnect, and cleanup must not block on it. The event
 * listener is removed so a later 'error' from the dead client cannot crash
 * the test process. */
function detachRedis(redis: Redis | null): void {
	if (!redis) return
	redis.removeAllListeners('error')
	redis.removeAllListeners('close')
	try {
		redis.disconnect()
	} catch {
		// already disconnected; nothing to clean up
	}
}

/** Reject after a real deadline (the recovery path is real ioredis
 * reconnecting against a real socket, so a bounded wall-clock deadline is
 * the only sane guard, mirroring the blackhole test). */
function boundedReject(message: string, ms = 5000): Promise<never> {
	const result = Promise.withResolvers<never>()
	const timer = setTimeout(() => result.reject(new Error(message)), ms)
	timer.unref?.()
	return result.promise
}

/** Re-listen the same server on its original port (the client's URL is
 * fixed at construction, so recovery means the same endpoint comes back). */
function restartServer(server: Server, port: number): Promise<void> {
	const { promise, resolve, reject } = Promise.withResolvers<void>()
	const onError = (error: unknown) => reject(error)
	server.once('error', onError)
	server.listen(port, '127.0.0.1', () => {
		server.off('error', onError)
		resolve()
	})
	return promise
}

describe('rate-limit Redis reconnection', () => {
	test('a dropped link recovers without a restart: commands fail fast offline and succeed after reconnect', async () => {
		const responder = await startResponder()
		let redis: Redis | null = null
		try {
			process.env.REDIS_URL = `redis://127.0.0.1:${responder.port}`
			delete process.env.REDIS_CACHE_URL
			redis = createRateLimitRedis()
			if (!redis) throw new Error('Expected control Redis client')
			redis.on('error', () => {})
			// Establish the link, then drop it: ioredis must keep reconnecting
			// in place (capped backoff), never terminal-disconnect.
			const initial = await redis.ping()
			expect(initial).toBe('PONG')
			await stopServer(responder.server, responder.sockets)
			// Await the real close event so the next command is issued while
			// the client is definitely reconnecting (offline-queued), not on
			// a dying socket.
			await once(redis, 'close')
			expect(redis.status).not.toBe('end')

			// A command issued while the link is down sits in ioredis's
			// offline queue. Restore the same endpoint: the same client
			// instance reconnects (capped backoff) and flushes it. A real
			// wall-clock deadline is required because this deliberately
			// exercises ioredis's actual reconnect against a dropped socket —
			// under the old retryStrategy: () => null the client
			// terminal-disconnected and blipCommand would never resolve, so
			// the race fails fast instead of hanging (the regression guard).
			const blipCommand = redis.ping()
			// If the race below times out, the cleanup disconnect rejects the
			// offline-queued command; swallow that late rejection so the test
			// failure stays the race deadline, not an unhandled rejection.
			blipCommand.catch(() => {})
			await restartServer(responder.server, responder.port)
			const restored = await Promise.race([
				blipCommand,
				boundedReject('rate-limit Redis did not reconnect after the drop')
			])
			expect(restored).toBe('PONG')
			expect(redis.status).not.toBe('end')
		} finally {
			// Deterministic even on assertion failure: the client is detached
			// without awaiting (a mid-reconnect disconnect can hang) and the
			// responder is only stopped while it is still listening.
			detachRedis(redis)
			if (responder.server.listening) await stopServer(responder.server, responder.sockets)
		}
	}, 30000)

	test('reconnect backoff is capped and never terminal', () => {
		process.env.REDIS_URL = 'redis://127.0.0.1:1'
		delete process.env.REDIS_CACHE_URL
		const redis = createRateLimitRedis()
		if (!redis) throw new Error('Expected control Redis client')
		redis.disconnect()
		// ioredis stores the configured options on the instance: the capped
		// strategy is attempt 1 = base delay, larger attempts clamped to the
		// cap, and a number (never null, which would stop reconnecting).
		const strategy = redis.options.retryStrategy
		expect(typeof strategy).toBe('function')
		if (typeof strategy !== 'function') throw new Error('Expected a retryStrategy')
		expect(strategy(1)).toBe(RATE_LIMIT_RETRY_BASE_MS)
		expect(strategy(1000)).toBe(RATE_LIMIT_RETRY_CAP_MS)
		expect(strategy(100000)).toBe(RATE_LIMIT_RETRY_CAP_MS)
	})
})
