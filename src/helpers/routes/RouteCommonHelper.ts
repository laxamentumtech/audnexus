import { FastifyReply } from 'fastify'

import { RequestGeneric } from '#config/typing/requests'
import SharedHelper from '#helpers/utils/shared'
import { MessageBadAsin, MessageBadRegion } from '#static/messages'

class RouteCommonHelper {
	asin: string
	query: RequestGeneric['Querystring']
	reply: FastifyReply
	sharedHelper: SharedHelper
	constructor(asin: string, query: RequestGeneric['Querystring'], reply: FastifyReply) {
		this.asin = asin
		this.query = this.parseOptions(query)
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
	handler(): { options: RequestGeneric['Querystring']; reply: FastifyReply } {
		this.runValidations()
		return {
			options: this.query,
			reply: this.reply
		}
	}

	/**
	 * Check if asin is valid
	 * Check if region is valid
	 */
	runValidations(): void {
		if (!this.isValidAsin()) this.throwBadAsinError()
		if (this.query.region && !this.isValidRegion()) this.throwBadRegionError()
	}

	/**
	 * Parse the query string
	 */
	parseOptions(query: RequestGeneric['Querystring']): RequestGeneric['Querystring'] {
		return {
			...(query.name && { name: query.name }),
			region: query.region ?? 'us',
			...(query.seedAuthors && { seedAuthors: query.seedAuthors }),
			...(query.update && { update: query.update })
		}
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
	 * Throw error if region is invalid
	 * Sets reply code to 400
	 */
	throwBadRegionError(): void {
		this.reply.code(400)
		throw new Error(MessageBadRegion)
	}
}

export default RouteCommonHelper
