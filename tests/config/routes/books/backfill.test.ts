import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import _backfill from '#config/routes/books/backfill'

const mockProcess = mock()

mock.module('#helpers/routes/BookBackfillHelper', () => ({
	default: class MockBookBackfillHelper {
		logger: unknown
		constructor(_logger: unknown) {
			this.logger = _logger
		}
		async process() {
			return mockProcess()
		}
	}
}))

const mockLog = {
	error: mock(),
	info: mock(),
	debug: mock(),
	warn: mock()
}

function makeApp() {
	// ponytail: minimal fastify stub — only what the route registers
	const app = { post: mock() }
	return app
}

function getHandler(app: ReturnType<typeof makeApp>) {
	return app.post.mock.calls[0][1] as (
		request: {
			headers: Record<string, unknown>
			log: typeof mockLog
		},
		reply: ReturnType<typeof makeReply>
	) => Promise<unknown>
}

function makeReply() {
	const reply = {
		code: mock(() => reply),
		send: mock(() => reply)
	}
	return reply
}

describe('POST /books/backfill-ratings', () => {
	let app: ReturnType<typeof makeApp>
	let OLD_ENV: { UPDATE_STATS: string | undefined; ADMIN_TOKEN: string | undefined }

	beforeEach(async () => {
		mockProcess.mockReset()
		OLD_ENV = {
			UPDATE_STATS: process.env.UPDATE_STATS,
			ADMIN_TOKEN: process.env.ADMIN_TOKEN
		}
		delete process.env.UPDATE_STATS
		delete process.env.ADMIN_TOKEN
		app = makeApp()
		await _backfill(app as never)
	})

	afterEach(() => {
		if (OLD_ENV.UPDATE_STATS === undefined) delete process.env.UPDATE_STATS
		else process.env.UPDATE_STATS = OLD_ENV.UPDATE_STATS
		if (OLD_ENV.ADMIN_TOKEN === undefined) delete process.env.ADMIN_TOKEN
		else process.env.ADMIN_TOKEN = OLD_ENV.ADMIN_TOKEN
	})

	it('returns 404 when UPDATE_STATS is not enabled', async () => {
		const reply = makeReply()
		await getHandler(app)({ headers: {}, log: mockLog }, reply)
		expect(reply.code).toHaveBeenCalledWith(404)
	})

	it('returns 401 when x-admin-token header is missing', async () => {
		process.env.UPDATE_STATS = '1'
		process.env.ADMIN_TOKEN = 'secret'
		const reply = makeReply()
		await getHandler(app)({ headers: {}, log: mockLog }, reply)
		expect(reply.code).toHaveBeenCalledWith(401)
	})

	it('returns 401 when admin token does not match', async () => {
		process.env.UPDATE_STATS = '1'
		process.env.ADMIN_TOKEN = 'secret'
		const reply = makeReply()
		await getHandler(app)({ headers: { 'x-admin-token': 'wrong' }, log: mockLog }, reply)
		expect(reply.code).toHaveBeenCalledWith(401)
	})

	it('runs backfill with valid token and returns summary', async () => {
		process.env.UPDATE_STATS = '1'
		process.env.ADMIN_TOKEN = 'secret'
		mockProcess.mockResolvedValue({ total: 1, updated: 1, failed: 0 })
		const reply = makeReply()
		const result = await getHandler(app)(
			{ headers: { 'x-admin-token': 'secret' }, log: mockLog },
			reply
		)
		expect(mockProcess).toHaveBeenCalledTimes(1)
		expect(result).toEqual({
			message: 'Ratings backfill complete',
			total: 1,
			updated: 1,
			failed: 0
		})
	})
})

afterAll(() => {
	mock.restore()
})
