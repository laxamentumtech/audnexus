import type { FastifyRedis } from '@fastify/redis'

import { ApiChapter, Book } from '#config/typing/books'
import { AuthorProfile } from '#config/typing/people'

export default class RedisHelper {
	instance: FastifyRedis | null
	key: string
	constructor(instance: FastifyRedis | null, key: string) {
		this.instance = instance
		this.key = key
	}

	async deleteKey(id: string) {
		try {
			this.instance?.del(id)
		} catch (err) {
			console.error(err)
			throw new Error(`An error occurred while deleting ${this.key}-${id} in redis`)
		}
	}

	async findOne(id: string): Promise<AuthorProfile | Book | ApiChapter | undefined> {
		await this.instance?.get(`${this.key}-${id}`, (_err, val) => {
			if (!val) return undefined
			return JSON.parse(val) as AuthorProfile | Book | ApiChapter
		})
		return undefined
	}

	async findOrCreate(id: string, data: AuthorProfile | Book | ApiChapter | undefined) {
		const found = await this.findOne(id)
		// Return if found
		if (found) return found
		// Create if not found
		if (data) {
			try {
				await this.setKey(id, data)
				return data
			} catch (err) {
				console.error(err)
				throw new Error(`An error occurred while creating ${this.key}-${id} in redis`)
			}
		}
	}

	async setKey(id: string, data: AuthorProfile | Book | ApiChapter) {
		return this.instance?.set(id, JSON.stringify(data, null, 2))
	}
}
