import rateLimit from '@fastify/rate-limit'
import { afterEach, describe, expect, test } from 'bun:test'
import { fastify } from 'fastify'
import { once } from 'node:events'
import { createServer, type Socket } from 'node:net'

import { createRateLimitRedis } from '#config/redis'

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

describe('rate-limit Redis blackhole behavior', () => {
	test('a command on an established but nonresponsive Redis socket fails the request promptly', async () => {
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
					} else if (decoded.command === 'CLIENT') {
						socket.write('+OK\r\n')
					} else if (decoded.command !== 'EVAL' && decoded.command !== 'EVALSHA') {
						socket.write('+OK\r\n')
					}
					// EVAL/EVALSHA deliberately receive no reply: this models a
					// connected Redis TCP path that blackholes rate-limit commands.
				}
			})
		})
		const listening = once(server, 'listening')
		server.listen(0, '127.0.0.1')
		await listening

		const address = server.address()
		if (!address || typeof address === 'string') throw new Error('Expected a TCP server address')
		process.env.REDIS_URL = `redis://127.0.0.1:${address.port}`
		delete process.env.REDIS_CACHE_URL

		const redis = createRateLimitRedis()
		if (!redis) throw new Error('Expected control Redis client')
		redis.on('error', () => {})
		const app = fastify()
		let timeout: NodeJS.Timeout | undefined
		try {
			await app.register(rateLimit, { max: 100, redis, timeWindow: '1 minute' })
			app.get('/limited', async () => ({ ok: true }))
			// A real wall-clock deadline is required because this test deliberately
			// exercises ioredis's actual commandTimeout against a blackholed socket.
			const timeoutOutcome = Promise.withResolvers<{ kind: 'timeout' }>()
			timeout = setTimeout(() => timeoutOutcome.resolve({ kind: 'timeout' }), 5000)
			const outcome = await Promise.race([
				app.inject({ method: 'GET', url: '/limited' }).then((response) => ({
					kind: 'response' as const,
					statusCode: response.statusCode
				})),
				timeoutOutcome.promise
			])

			expect(outcome.kind).toBe('response')
			if (outcome.kind === 'response') expect(outcome.statusCode).toBeGreaterThanOrEqual(500)
			expect(commands).toContain('INFO')
			expect(commands.some((command) => command === 'EVAL' || command === 'EVALSHA')).toBe(true)
		} finally {
			clearTimeout(timeout)
			redis.disconnect()
			await app.close()
			const closed = once(server, 'close')
			server.close()
			for (const socket of sockets) socket.destroy()
			await closed
		}
	}, 10000)
})
