import { FastifyReply } from 'fastify'

import { ApiQueryString, ApiQueryStringSchema } from '#config/types'
import SharedHelper from '#helpers/utils/shared'
import { MessageBadAsin, MessageBadRegion, MessageNoSearchParams } from '#static/messages'

class RouteCommonHelper {
	asin: string
	query: ApiQueryString
	reply: FastifyReply
	sharedHelper: SharedHelper
	constructor(asin: string, query: unknown, reply: FastifyReply) {
		this.asin = asin
		this.query = ApiQueryStringSchema.parse(query)
		this.reply = reply
		this.sharedHelper = new SharedHelper()
	}

	/**
	 * Calls sharedHelper.isValidAsin
	 */
	isValidAsin(): boolean {
		return this.sharedHelper.isValidAsin(this.asin)
	}

	/**
	 * Check if name is valid (not empty)
	 */
	isValidName(): boolean {
		return this.sharedHelper.isValidName(this.query.name)
	}

	/**
	 * Calls sharedHelper.isValidRegion
	 */
	isValidRegion(): boolean {
		if (!this.query.region) return false
		return this.sharedHelper.isValidRegion(this.query.region)
	}

	/**
	 * Run validations
	 * Reply object may be modified by validations
	 * @returns {object} - Returns object with reply and options
	 */
	handler(): { options: ApiQueryString; reply: FastifyReply } {
		this.runValidations()
		return {
			options: this.query,
			reply: this.reply
		}
	}

	/**
	 * Check if asin is valid (when present)
	 * Check if name is valid (when present)
	 * Check if region is valid
	 */
	runValidations(): void {
		if (this.asin && !this.isValidAsin()) this.throwBadAsinError()
		if (!this.asin && !this.isValidName()) this.throwBadNameError()
		if (this.query.region && !this.isValidRegion()) this.throwBadRegionError()
	}

	/**
	 * Throw error if asin is invalid
	 * Sets reply code to 400
	 */
	throwBadAsinError(): void {
		this.reply.code(400)
		throw new Error(MessageBadAsin)
	}

	/**
	 * Throw error if name is invalid
	 * Sets reply code to 400
	 */
	throwBadNameError(): void {
		this.reply.code(400)
		throw new Error(MessageNoSearchParams)
	}

	/**
	 * Throw error if region is invalid
	 * Sets reply code to 400
	 */
	throwBadRegionError(): void {
		this.reply.code(400)
		throw new Error(MessageBadRegion)
	}
}

export default RouteCommonHelper
