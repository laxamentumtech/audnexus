jest.mock('@fastify/redis')
import type { FastifyRedis } from '@fastify/redis'
import { DeepMockProxy, mockDeep } from 'jest-mock-extended'

import RedisHelper from '#helpers/database/redis/RedisHelper'
import { parsedAuthor } from '#tests/datasets/helpers/authors'
import { parsedBook } from '#tests/datasets/helpers/books'

type MockContext = {
	client: DeepMockProxy<FastifyRedis>
}

let asin: string
let ctx: MockContext
let helper: RedisHelper

const createMockContext = (): MockContext => {
	return {
		client: mockDeep<FastifyRedis>()
	}
}

beforeEach(() => {
	asin = 'B079LRSMNN'
	ctx = createMockContext()
	helper = new RedisHelper(ctx.client, 'books', asin)
})

describe('RedisHelper should', () => {
	test('return undefined with a null instance', async () => {
		helper = new RedisHelper(null, 'books', asin)
		await expect(helper.deleteOne()).resolves.toBeUndefined()
		await expect(helper.findOne()).resolves.toBeUndefined()
		await expect(helper.findOrCreate(parsedBook)).resolves.toBe(parsedBook)
		await expect(helper.setOne(parsedBook)).resolves.toBeUndefined()
	})
	test('deleteOne book', async () => {
		jest.spyOn(ctx.client, 'del').mockResolvedValue(1)
		await expect(helper.deleteOne()).resolves.toBe(1)
		expect(ctx.client.del).toHaveBeenCalledWith('books-B079LRSMNN')
	})
	test('did not deleteOne book', async () => {
		jest.spyOn(ctx.client, 'del').mockResolvedValue(0)
		await expect(helper.deleteOne()).resolves.toBeFalsy()
		expect(ctx.client.del).toHaveBeenCalledWith('books-B079LRSMNN')
	})
	test('findOne book and return it', async () => {
		jest.spyOn(ctx.client, 'get').mockResolvedValue(JSON.stringify(parsedBook))
		await expect(helper.findOne()).resolves.toEqual(parsedBook)
		expect(ctx.client.get).toHaveBeenCalledWith('books-B079LRSMNN')
	})
	test('did not findOne book and return undefined', async () => {
		jest.spyOn(ctx.client, 'get').mockResolvedValue('')
		await expect(helper.findOne()).resolves.toBeUndefined()
		expect(ctx.client.get).toHaveBeenCalledWith('books-B079LRSMNN')
	})
	test('findOne Author and return it', async () => {
		asin = parsedAuthor.asin
		helper = new RedisHelper(ctx.client, 'authors', asin)
		jest.spyOn(ctx.client, 'get').mockResolvedValue(JSON.stringify(parsedAuthor))
		await expect(helper.findOne()).resolves.toEqual(parsedAuthor)
		expect(ctx.client.get).toHaveBeenCalledWith('authors-B012DQ3BCM')
	})
	test('findOrCreate book and return it', async () => {
		jest.spyOn(ctx.client, 'get').mockResolvedValue(JSON.stringify(parsedBook))
		await expect(helper.findOrCreate(parsedBook)).resolves.toEqual(parsedBook)
		expect(ctx.client.get).toHaveBeenCalledWith('books-B079LRSMNN')
	})
	test('findOrCreate book and create it', async () => {
		jest.spyOn(ctx.client, 'get').mockResolvedValue('')
		jest.spyOn(ctx.client, 'set').mockResolvedValue('OK')
		await expect(helper.findOrCreate(parsedBook)).resolves.toEqual(parsedBook)
		expect(ctx.client.get).toHaveBeenCalledWith('books-B079LRSMNN')
		expect(ctx.client.set).toHaveBeenCalledWith(
			'books-B079LRSMNN',
			JSON.stringify(parsedBook, null, 2)
		)
	})
})

describe('RedisHelper should catch error when', () => {
	test('deleteOne book', async () => {
		jest.spyOn(ctx.client, 'del').mockRejectedValue(new Error('Redis error'))
		await expect(helper.deleteOne()).rejects.toThrow(
			`An error occurred while deleting books-${asin} in redis`
		)
		expect(ctx.client.del).toHaveBeenCalledWith('books-B079LRSMNN')
	})
	test('findOne get rejects', async () => {
		jest.spyOn(ctx.client, 'get').mockRejectedValue(new Error('Error'))
		await expect(helper.findOne()).resolves.toBeUndefined()
		expect(ctx.client.get).toHaveBeenCalledWith('books-B079LRSMNN')
	})
	test('findOrCreate get rejects', async () => {
		jest.spyOn(ctx.client, 'get').mockRejectedValue(new Error('Error'))
		await expect(helper.findOrCreate(parsedBook)).resolves.toBe(parsedBook)
		expect(ctx.client.get).toHaveBeenCalledWith('books-B079LRSMNN')
	})
	test('findOrCreate set rejects', async () => {
		jest.spyOn(ctx.client, 'get').mockResolvedValue('')
		jest.spyOn(ctx.client, 'set').mockRejectedValue(new Error('Error'))
		await expect(helper.findOrCreate(parsedBook)).rejects.toThrowError(
			`An error occurred while setting books-${asin} in redis`
		)
		expect(ctx.client.get).toHaveBeenCalledWith('books-B079LRSMNN')
		expect(ctx.client.set).toHaveBeenCalledWith(
			'books-B079LRSMNN',
			JSON.stringify(parsedBook, null, 2)
		)
	})
})
