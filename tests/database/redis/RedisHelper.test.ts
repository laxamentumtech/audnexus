import type { FastifyRedis } from '@fastify/redis'
import { beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import type { FastifyBaseLogger } from 'fastify'

import RedisHelper from '#helpers/database/redis/RedisHelper'
import { parsedAuthor } from '#tests/datasets/helpers/authors'
import { parsedBook } from '#tests/datasets/helpers/books'
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
			expire: mock(),
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
		await expect(helper.setExpiration()).resolves.toBeUndefined()
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
		await expect(helper.findOne()).resolves.toEqual(parsedBook)
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
		expect(ctx.client.set).toHaveBeenCalledWith(
			`${region}-book-${asin}`,
			JSON.stringify(parsedBook)
		)
	})
	test('setExpiration', async () => {
		ctx.client.expire.mockResolvedValue(1)
		await expect(helper.setExpiration()).resolves.toBeUndefined()
		expect(ctx.client.expire).toHaveBeenCalledWith(`${region}-book-${asin}`, 432000)
	})
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
	test('findOrCreate set rejects', async () => {
		ctx.client.get.mockResolvedValue('')
		ctx.client.set.mockRejectedValue(new Error('Error'))
		await expect(helper.findOrCreate(parsedBook)).rejects.toThrow(
			`An error occurred while setting ${region}-book-${asin} in redis`
		)
		expect(ctx.client.get).toHaveBeenCalledWith(`${region}-book-${asin}`)
		expect(ctx.client.set).toHaveBeenCalledWith(
			`${region}-book-${asin}`,
			JSON.stringify(parsedBook)
		)
	})
	test('setExpiration rejects', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new RedisHelper(ctx.client, 'book', asin, region, mockLogger as unknown as FastifyBaseLogger)
		ctx.client.expire.mockRejectedValue(
			new Error(`An error occurred while setting expiration for ${region}-book-${asin} in redis`)
		)
		await expect(helperWithLogger.setExpiration()).resolves.toBeUndefined()
		expect(ctx.client.expire).toHaveBeenCalledWith(`${region}-book-${asin}`, 432000)
		expect(mockLogger.error).toHaveBeenCalledWith(
			`An error occurred while setting expiration for ${region}-book-${asin} in redis`
		)
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
