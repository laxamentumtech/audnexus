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

// Controllable promise so a test can hold a backfill in flight
function deferred() {
	let resolve!: (value: { total: number; updated: number; skipped: number; failed: number }) => void
	const promise = new Promise<{ total: number; updated: number; skipped: number; failed: number }>(
		(r) => {
			resolve = r
		}
	)
	return { promise, resolve }
}

// Let microtasks drain so the background promise chain settles
async function flush() {
	await new Promise((r) => setTimeout(r, 0))
}

const validHeaders = { 'x-admin-token': 'secret' }

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
		expect(mockProcess).not.toHaveBeenCalled()
	})

	it('returns 401 when admin token does not match', async () => {
		process.env.UPDATE_STATS = '1'
		process.env.ADMIN_TOKEN = 'secret'
		const reply = makeReply()
		await getHandler(app)({ headers: { 'x-admin-token': 'wrong' }, log: mockLog }, reply)
		expect(reply.code).toHaveBeenCalledWith(401)
		expect(mockProcess).not.toHaveBeenCalled()
	})

	it('returns 202 immediately while the backfill runs in the background', async () => {
		process.env.UPDATE_STATS = '1'
		process.env.ADMIN_TOKEN = 'secret'
		const { promise, resolve } = deferred()
		mockProcess.mockReturnValue(promise)
		const reply = makeReply()
		const handler = getHandler(app)
		const done = handler({ headers: validHeaders, log: mockLog }, reply)
		const result = await done
		expect(reply.code).toHaveBeenCalledWith(202)
		expect(reply.send).toHaveBeenCalledWith({ message: 'Ratings backfill started' })
		expect(result).toBe(reply)
		expect(mockProcess).toHaveBeenCalledTimes(1)
		// The backfill must still be in flight when the response was sent
		resolve({ total: 1, updated: 1, skipped: 0, failed: 0 })
		await promise
		await flush()
	})

	it('logs the backfill summary when the background run completes', async () => {
		process.env.UPDATE_STATS = '1'
		process.env.ADMIN_TOKEN = 'secret'
		mockLog.info.mockReset()
		const summary = { total: 5, updated: 4, skipped: 1, failed: 0 }
		mockProcess.mockReturnValue(summary)
		const handler = getHandler(app)
		await handler({ headers: validHeaders, log: mockLog }, makeReply())
		await flush()
		expect(mockLog.info).toHaveBeenCalledTimes(1)
		expect(mockLog.info).toHaveBeenCalledWith({ summary }, 'Ratings backfill complete')
	})

	it('returns 409 while a backfill is in progress and allows a run after it settles', async () => {
		process.env.UPDATE_STATS = '1'
		process.env.ADMIN_TOKEN = 'secret'
		const { promise, resolve } = deferred()
		mockProcess.mockReturnValue(promise)
		const handler = getHandler(app)
		await handler({ headers: validHeaders, log: mockLog }, makeReply())
		expect(mockProcess).toHaveBeenCalledTimes(1)
		// Second call while the first is still pending → 409, no second run
		const blocked = makeReply()
		await handler({ headers: validHeaders, log: mockLog }, blocked)
		expect(blocked.code).toHaveBeenCalledWith(409)
		expect(blocked.send).toHaveBeenCalledWith({
			error: 'Conflict',
			message: 'Backfill already in progress'
		})
		expect(mockProcess).toHaveBeenCalledTimes(1)
		// After the first run settles, the guard clears and a new run starts
		resolve({ total: 1, updated: 0, skipped: 0, failed: 1 })
		await promise
		await flush()
		mockProcess.mockReset()
		const retry = makeReply()
		await handler({ headers: validHeaders, log: mockLog }, retry)
		expect(retry.code).toHaveBeenCalledWith(202)
		expect(mockProcess).toHaveBeenCalledTimes(1)
		// Drain the retry run so it cannot wedge subsequent tests
		await flush()
	})

	it('logs the error when the background backfill rejects and clears the guard', async () => {
		process.env.UPDATE_STATS = '1'
		process.env.ADMIN_TOKEN = 'secret'
		let reject!: (err: Error) => void
		const promise = new Promise<never>((_, r) => {
			reject = r
		})
		mockProcess.mockReturnValue(promise)
		const handler = getHandler(app)
		await handler({ headers: validHeaders, log: mockLog }, makeReply())
		reject(new Error('boom'))
		await expect(promise).rejects.toThrow('boom')
		await flush()
		expect(mockLog.error).toHaveBeenCalledTimes(1)
		// Guard cleared → a new run is accepted
		mockProcess.mockReset()
		const retry = makeReply()
		await handler({ headers: validHeaders, log: mockLog }, retry)
		expect(retry.code).toHaveBeenCalledWith(202)
		// Drain the retry run
		await flush()
	})
})

afterAll(() => {
	mock.restore()
})
