// Real Fastify injection against the shared structured error handler:
// a typed error's `details.code` must take precedence over the handler's
// per-class default code (NOT_FOUND for NotFoundError), and a matching
// non-404 status must pass through the same envelope.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { fastify, type FastifyInstance } from 'fastify'

import { registerApiErrorHandler } from '#config/errorHandler'
import { NotFoundError } from '#helpers/errors/ApiErrors'
import { UpstreamGoneError } from '#helpers/utils/upstreamGone'

function makeApp(): FastifyInstance {
	const app = fastify({ logger: false, disableRequestLogging: true })
	registerApiErrorHandler(app)
	app.get('/region-gone', () => {
		throw new NotFoundError('x', { code: 'REGION_UNAVAILABLE' })
	})
	app.get('/upstream-gone', () => {
		throw new UpstreamGoneError('https://audible.com/p/B00TEST123')
	})
	return app
}

describe('registerApiErrorHandler details.code precedence', () => {
	let app: FastifyInstance
	beforeEach(async () => {
		app = makeApp()
		await app.ready()
	})
	afterEach(async () => {
		await app.close()
	})

	test('details.code wins over the class default (REGION_UNAVAILABLE)', async () => {
		const res = await app.inject({ method: 'GET', url: '/region-gone' })
		expect(res.statusCode).toBe(404)
		const body = res.json() as { error: { code: string; message: string } }
		expect(body.error.code).toBe('REGION_UNAVAILABLE')
		// The default NOT_FOUND mapping must not win.
		expect(body.error.code).not.toBe('NOT_FOUND')
		expect(body.error.message).toBe('x')
	})

	test('a matching-status constructor keeps its details.code (UPSTREAM_GONE)', async () => {
		const res = await app.inject({ method: 'GET', url: '/upstream-gone' })
		expect(res.statusCode).toBe(404)
		const body = res.json() as { error: { code: string; message: string } }
		expect(body.error.code).toBe('UPSTREAM_GONE')
		expect(body.error.message).toBe(
			'Upstream page gone (redirected to search): https://audible.com/p/B00TEST123'
		)
	})
})
