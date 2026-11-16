// Real Fastify injection against the GET /books/:asin route, focused on the
// shared query-string schema boundary: `expand` is only valid on the similar
// route, so a non-similar RouteCommonHelper route must accept (and strip) it
// without a 400. The BookShowHelper is mocked at its boundary.

import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { fastify, type FastifyInstance } from 'fastify'

import { registerApiErrorHandler } from '#config/errorHandler'
import bookShow from '#config/routes/books/show'

const showResult = { asin: 'B00TEST123', title: 'A Book', region: 'us' }
const mockHelperHandler = mock()

mock.module('#helpers/routes/BookShowHelper', () => ({
	default: class MockBookShowHelper {
		asin: string
		options: { region: string }
		constructor(asin: string, options: { region: string }) {
			this.asin = asin
			this.options = options
		}
		handler() {
			return mockHelperHandler(this.asin, this.options)
		}
	}
}))

const ASIN = 'B00TEST123'

let app: FastifyInstance

beforeEach(async () => {
	mockHelperHandler.mockReset()
	mockHelperHandler.mockResolvedValue(showResult)
	app = fastify({ logger: false, disableRequestLogging: true })
	registerApiErrorHandler(app)
	await app.register(bookShow)
	await app.ready()
})

afterEach(async () => {
	await app.close()
})

afterAll(() => {
	mock.restore()
})

describe('GET /books/:asin', () => {
	test('accepts ?expand=books from the similar route without a 400 (parameter is stripped)', async () => {
		const response = await app.inject({ method: 'GET', url: `/books/${ASIN}?expand=books` })
		expect(response.statusCode).toBe(200)
		expect(response.json()).toEqual(showResult)
		expect(mockHelperHandler).toHaveBeenCalledTimes(1)
		expect(mockHelperHandler.mock.calls[0][0]).toBe(ASIN)
		expect(mockHelperHandler.mock.calls[0][1].region).toBe('us')
	})
})
