import type { FastifyRedis } from '@fastify/redis'

import { Book } from '#config/typing/books'
import { ParsedObject } from '#config/typing/unions'
import getErrorMessage from '#helpers/utils/getErrorMessage'
import { ErrorMessageRedisDelete, ErrorMessageRedisSet } from '#static/messages'

export default class RedisHelper {
	instance: FastifyRedis | null
	key: string
	constructor(instance: FastifyRedis | null, key: string, id: string, region: string) {
		this.instance = instance
		this.key = `${region}-${key}-${id}`
	}

	convertStringToDate(parsed: Book) {
		parsed.releaseDate = new Date(parsed.releaseDate)
		return parsed
	}

	/**
	 * Delete single key from Redis
	 * @returns {boolean} - True if deleted, false if not
	 * @throws {Error} - If there's an error
	 */
	async deleteOne(): Promise<boolean | undefined> {
		try {
			const deleted = await this.instance?.del(this.key)
			if (deleted === undefined) return undefined
			return deleted === 1
		} catch (error) {
			const message = getErrorMessage(error)
			console.error(message)
			throw new Error(ErrorMessageRedisDelete(this.key))
		}
	}

	/**
	 * Find one key from Redis
	 * @returns {ParsedObject | undefined} - ParsedObject if found, undefined if not
	 * @throws {Error} - If there's an error
	 */
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

	/**
	 * Find one key from Redis, if not found, create it
	 * @param {ParsedObject | undefined} data - Data to create if not found
	 * @returns {ParsedObject | undefined} - ParsedObject if found, undefined if not
	 * @throws {Error} - If there's an error
	 */
	async findOrCreate(data: ParsedObject | undefined): Promise<ParsedObject | undefined> {
		const found = await this.findOne()
		// Return if found
		if (found) return found
		// Create if not found
		if (data) {
			await this.setOne(data)
			return data
		}
	}

	/**
	 * Set TTL expiration to 5 days
	 * @returns {void}
	 */
	async setExpiration(): Promise<void> {
		try {
			await this.instance?.expire(this.key, 432000)
		} catch (error) {
			const message = getErrorMessage(error)
			console.error(message)
		}
	}

	/**
	 * Set one key in Redis
	 * @param {ParsedObject} data - Data to set
	 * @returns {string | undefined} - Status if set, null if not
	 * @throws {Error} - If there's an error
	 */
	async setOne(data: ParsedObject): Promise<string | undefined> {
		try {
			const set = await this.instance?.set(this.key, JSON.stringify(data, null, 2))
			this.setExpiration()
			return set
		} catch (error) {
			const message = getErrorMessage(error)
			console.error(message)
			throw new Error(ErrorMessageRedisSet(this.key))
		}
	}
}
