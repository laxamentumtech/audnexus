import type { FastifyRedis } from '@fastify/redis'
import { beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import type { FastifyBaseLogger } from 'fastify'

import { REDIS_CACHE_TTL_SECONDS } from '#config/redis'
import RedisHelper from '#helpers/database/redis/RedisHelper'
import { parsedAuthor } from '#tests/datasets/helpers/authors'
import { parsedBook } from '#tests/datasets/helpers/books'
import { parsedChapters } from '#tests/datasets/helpers/chapters'
import { createMockLogger } from '#tests/setup/mockLogger'

type MockContext = {
	client: FastifyRedis
}

let asin: string
let ctx: MockContext
let helper: RedisHelper
let region: string

const createMockContext = (): MockContext => {
	return {
		client: {
			del: mock(),
			get: mock(),
			set: mock(),
			connect: mock(),
			disconnect: mock(),
			quit: mock(),
			sendCommand: mock(),
			subscribe: mock(),
			unsubscribe: mock(),
			psubscribe: mock(),
			punsubscribe: mock(),
			duplicate: mock(),
			monitor: mock(),
			INFO: mock(),
			CLIENT: mock()
		} as unknown as FastifyRedis
	}
}


beforeEach(() => {
	asin = 'B079LRSMNN'
	ctx = createMockContext()
	region = 'us'
	helper = new RedisHelper(ctx.client, 'book', asin, region)
})

describe('RedisHelper should', () => {
	test('return undefined with a null instance', async () => {
		helper = new RedisHelper(null, 'book', asin, region)
		await expect(helper.deleteOne()).resolves.toBeUndefined()
		await expect(helper.findOne()).resolves.toBeUndefined()
		await expect(helper.findOrCreate(parsedBook)).resolves.toBe(parsedBook)
		await expect(helper.setOne(parsedBook)).resolves.toBeUndefined()
	})
	test('deleteOne book', async () => {
		ctx.client.del.mockResolvedValue(1)
		await expect(helper.deleteOne()).resolves.toBe(true)
		expect(ctx.client.del).toHaveBeenCalledWith(`${region}-book-${asin}`)
	})
	test('did not deleteOne book', async () => {
		ctx.client.del.mockResolvedValue(0)
		await expect(helper.deleteOne()).resolves.toBe(false)
		expect(ctx.client.del).toHaveBeenCalledWith(`${region}-book-${asin}`)
	})
	test('findOne book and return it', async () => {
		ctx.client.get.mockResolvedValue(JSON.stringify(parsedBook))
		const found = await helper.findOne()
		expect(found).toEqual(parsedBook)
		expect(found).toHaveProperty('releaseDate', parsedBook.releaseDate)
		expect((found as typeof parsedBook | undefined)?.releaseDate).toBeInstanceOf(Date)
		expect(ctx.client.get).toHaveBeenCalledWith(`${region}-book-${asin}`)
	})
	test('did not findOne book and return undefined', async () => {
		ctx.client.get.mockResolvedValue('')
		await expect(helper.findOne()).resolves.toBeUndefined()
		expect(ctx.client.get).toHaveBeenCalledWith(`${region}-book-${asin}`)
	})
	test('findOne Author and return it', async () => {
		asin = parsedAuthor.asin
		helper = new RedisHelper(ctx.client, 'author', asin, region)
		ctx.client.get.mockResolvedValue(JSON.stringify(parsedAuthor))
		await expect(helper.findOne()).resolves.toEqual(parsedAuthor)
		expect(ctx.client.get).toHaveBeenCalledWith(`${region}-author-${asin}`)
	})
	test('uses the configured document-cache TTL', async () => {
		ctx.client.set.mockResolvedValue('OK')
		await expect(helper.setOne(parsedBook)).resolves.toBe('OK')
		expect(ctx.client.set).toHaveBeenCalledWith(
			`${region}-book-${asin}`,
			JSON.stringify(parsedBook),
			'EX',
			REDIS_CACHE_TTL_SECONDS
		)
	})
	test('findOrCreate book and return it', async () => {
		ctx.client.get.mockResolvedValue(JSON.stringify(parsedBook))
		await expect(helper.findOrCreate(parsedBook)).resolves.toEqual(parsedBook)
		expect(ctx.client.get).toHaveBeenCalledWith(`${region}-book-${asin}`)
	})
	test('findOrCreate book and create it', async () => {
		ctx.client.get.mockResolvedValue('')
		ctx.client.set.mockResolvedValue('OK')
		await expect(helper.findOrCreate(parsedBook)).resolves.toEqual(parsedBook)
		expect(ctx.client.get).toHaveBeenCalledWith(`${region}-book-${asin}`)
	})
})

describe('RedisHelper document-cache consumers', () => {
	for (const [type, data] of [
		['book', parsedBook],
		['author', parsedAuthor],
		['chapter', parsedChapters]
	] as const) {
		test(`parses a cached ${type} only once`, async () => {
			const cache = new RedisHelper(ctx.client, type, data.asin, region)
			const serialized = JSON.stringify(data)
			ctx.client.get.mockResolvedValue(serialized)
			const parse = spyOn(JSON, 'parse')
			let found: object | undefined
			let parseCalls: number
			try {
				found = await cache.findOne()
				parseCalls = parse.mock.calls.length
			} finally {
				parse.mockRestore()
			}
			expect(parseCalls).toBe(1)
			expect(found).toEqual(data)
			expect(ctx.client.get).toHaveBeenCalledWith(`${region}-${type}-${data.asin}`)
		})

		test(`sets the TTL atomically on ${type} inserts and overwrites`, async () => {
			const cache = new RedisHelper(ctx.client, type, data.asin, region)
			ctx.client.set.mockResolvedValue('OK')
			await expect(cache.setOne(data)).resolves.toBe('OK')
			await expect(cache.setOne(data)).resolves.toBe('OK')
			expect(ctx.client.set).toHaveBeenCalledTimes(2)
			for (const call of ctx.client.set.mock.calls) {
				expect(call).toEqual([
					`${region}-${type}-${data.asin}`,
					JSON.stringify(data),
					'EX',
					REDIS_CACHE_TTL_SECONDS
				])
			}
		})
	}
})

describe('RedisHelper should catch error when', () => {
	test('deleteOne book', async () => {
		ctx.client.del.mockRejectedValue(new Error('Redis error'))
		await expect(helper.deleteOne()).rejects.toThrow(
			`An error occurred while deleting ${region}-book-${asin} in redis`
		)
		expect(ctx.client.del).toHaveBeenCalledWith(`${region}-book-${asin}`)
	})
	test('findOne get rejects', async () => {
		ctx.client.get.mockRejectedValue(new Error('Error'))
		await expect(helper.findOne()).resolves.toBeUndefined()
		expect(ctx.client.get).toHaveBeenCalledWith(`${region}-book-${asin}`)
	})
	test('findOrCreate get rejects', async () => {
		ctx.client.get.mockRejectedValue(new Error('Error'))
		await expect(helper.findOrCreate(parsedBook)).resolves.toBe(parsedBook)
		expect(ctx.client.get).toHaveBeenCalledWith(`${region}-book-${asin}`)
	})
	test('setOne failure is reported as a Redis set error', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new RedisHelper(
			ctx.client,
			'book',
			asin,
			region,
			mockLogger as unknown as FastifyBaseLogger
		)
		ctx.client.set.mockRejectedValue(new Error('Redis error'))
		await expect(helperWithLogger.setOne(parsedBook)).rejects.toThrow(
			`An error occurred while setting ${region}-book-${asin} in redis`
		)
		expect(mockLogger.error).toHaveBeenCalledWith('Redis error')
	})
})

describe('RedisHelper fallbackLogger', () => {
	test('should use fallbackLogger.error when Redis operation fails without external logger', async () => {
		const helperWithoutLogger = new RedisHelper(ctx.client, 'book', asin, region)

		const consoleErrorSpy = spyOn(console, 'error').mockImplementation()

		try {
			ctx.client.get.mockRejectedValue(new Error('Redis connection failed'))

			await expect(helperWithoutLogger.findOne()).resolves.toBeUndefined()

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Redis connection failed')
			)
		} finally {
			consoleErrorSpy.mockRestore()
		}
	})
})
