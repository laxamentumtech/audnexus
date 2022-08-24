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

	convertStringToDate(parsed: Book) {
		parsed.releaseDate = new Date(parsed.releaseDate)
		return parsed
	}

	async deleteOne() {
		try {
			const deleted = await this.instance?.del(this.key)
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
			const parsed = JSON.parse(found)
			// Convert the release date to a date object if it's a book
			if (parsed.releaseDate) {
				return this.convertStringToDate(parsed)
			}
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
			return set
		} catch (err) {
			console.error(err)
			throw new Error(`An error occurred while setting ${this.key} in redis`)
		}
	}
}
