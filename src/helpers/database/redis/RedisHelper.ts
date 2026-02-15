import type { FastifyRedis } from '@fastify/redis'
import type { FastifyBaseLogger } from 'fastify'

import { ApiBook } from '#config/types'
import getErrorMessage from '#helpers/utils/getErrorMessage'
import { ErrorMessageRedisDelete, ErrorMessageRedisSet } from '#static/messages'

export default class RedisHelper {
	instance: FastifyRedis | null
	key: string
	logger?: FastifyBaseLogger
	constructor(
		instance: FastifyRedis | null,
		key: string,
		id: string,
		region: string,
		logger?: FastifyBaseLogger
	) {
		this.instance = instance
		this.key = `${region}-${key}-${id}`
		const fallbackLogger = {
			level: 'info',
			silent: () => undefined,
			error: (...args: unknown[]) => console.error(...args),
			info: (...args: unknown[]) => console.info(...args),
			debug: (...args: unknown[]) => console.debug(...args),
			warn: (...args: unknown[]) => console.warn(...args),
			fatal: (...args: unknown[]) => console.error(...args),
			trace: (...args: unknown[]) => console.trace(...args),
			child: () => fallbackLogger
		}
		this.logger = logger ?? fallbackLogger
	}

	convertStringToDate(parsed: ApiBook) {
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
			this.logger?.error(message)
			throw new Error(ErrorMessageRedisDelete(this.key))
		}
	}

	/**
	 * Find one key from Redis
	 * @returns {object | undefined} - object if found, undefined if not
	 * @throws {Error} - If there's an error
	 */
	async findOne(): Promise<object | undefined> {
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
			this.logger?.error(message)
			return undefined
		}
	}

	/**
	 * Find one key from Redis, if not found, create it
	 * @param {object | undefined} data - Data to create if not found
	 * @returns {object | undefined} - object if found, undefined if not
	 * @throws {Error} - If there's an error
	 */
	async findOrCreate(data: object | undefined): Promise<object | undefined> {
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
			this.logger?.error(message)
		}
	}

	/**
	 * Set one key in Redis
	 * @param {object} data - Data to set
	 * @returns {string | undefined} - Status if set, null if not
	 * @throws {Error} - If there's an error
	 */
	async setOne(data: object): Promise<string | undefined> {
		try {
			const set = await this.instance?.set(this.key, JSON.stringify(data))
			this.setExpiration()
			return set
		} catch (error) {
			const message = getErrorMessage(error)
			this.logger?.error(message)
			throw new Error(ErrorMessageRedisSet(this.key))
		}
	}
}
