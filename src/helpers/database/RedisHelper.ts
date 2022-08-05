import type { FastifyRedis } from '@fastify/redis'

import { ApiChapter, Book } from '#config/typing/books'
import { AuthorProfile } from '#config/typing/people'

export default class RedisHelper {
	instance: FastifyRedis | null
	key: string
	constructor(instance: FastifyRedis | null, key: string, id: string) {
		this.instance = instance
		this.key = `${key}-${id}`
	}

	async deleteOne() {
		try {
			const deleted = await this.instance?.del(this.key)
			if (!deleted) return undefined
			return deleted
		} catch (err) {
			console.error(err)
			throw new Error(`An error occurred while deleting ${this.key} in redis`)
		}
	}

	async findOne(): Promise<AuthorProfile | Book | ApiChapter | undefined> {
		try {
			const found = await this.instance?.get(this.key)
			if (!found) return undefined
			return JSON.parse(found)
		} catch (err) {
			console.error(err)
			return undefined
		}
	}

	async findOrCreate(data: AuthorProfile | Book | ApiChapter | undefined) {
		const found = await this.findOne()
		// Return if found
		if (found) return found
		// Create if not found
		if (data) {
			await this.setOne(data)
			return data
		}
	}

	async setOne(data: AuthorProfile | Book | ApiChapter) {
		try {
			const set = await this.instance?.set(this.key, JSON.stringify(data, null, 2))
			if (!set) return undefined
			return set
		} catch (err) {
			console.error(err)
			throw new Error(`An error occurred while setting ${this.key} in redis`)
		}
	}
}
