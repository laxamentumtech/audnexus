import type { FastifyRedis } from '@fastify/redis'

import { Book } from '#config/typing/books'
import { ParsedObject } from '#config/typing/unions'
import getErrorMessage from '#helpers/utils/getErrorMessage'
import { ErrorMessageRedisDelete, ErrorMessageRedisSet } from '#static/messages'

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
		} catch (error) {
			const message = getErrorMessage(error)
			console.error(message)
			throw new Error(ErrorMessageRedisDelete(this.key))
		}
	}

	async findOne(): Promise<ParsedObject | undefined> {
		try {
			const found = await this.instance?.get(this.key)
			if (!found) return undefined
			const parsed = JSON.parse(found)
			// Convert the release date to a date object if it's a book
			if (parsed.releaseDate) {
				return this.convertStringToDate(parsed)
			}
			return JSON.parse(found)
		} catch (error) {
			const message = getErrorMessage(error)
			console.error(message)
			return undefined
		}
	}

	async findOrCreate(data: ParsedObject | undefined) {
		const found = await this.findOne()
		// Return if found
		if (found) return found
		// Create if not found
		if (data) {
			await this.setOne(data)
			return data
		}
	}

	async setOne(data: ParsedObject) {
		try {
			const set = await this.instance?.set(this.key, JSON.stringify(data, null, 2))
			return set
		} catch (error) {
			const message = getErrorMessage(error)
			console.error(message)
			throw new Error(ErrorMessageRedisSet(this.key))
		}
	}
}
