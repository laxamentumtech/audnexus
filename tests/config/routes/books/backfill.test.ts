import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import _backfill from '#config/routes/books/backfill'

const mockEnqueue = mock()
const mockCountInFlight = mock()

mock.module('#helpers/jobs/bullmq', () => ({
	enqueueBackfillRatings: mockEnqueue,
	countBackfillJobsInFlight: mockCountInFlight
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
			headers: Record<string, string | undefined>
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

const validHeaders = { 'x-admin-token': 'secret' }

describe('POST /books/backfill-ratings', () => {
	let app: ReturnType<typeof makeApp>
	let OLD_ENV: {
		UPDATE_STATS: string | undefined
		ADMIN_TOKEN: string | undefined
		REDIS_URL: string | undefined
	}

	beforeEach(async () => {
		mockEnqueue.mockReset()
		mockCountInFlight.mockReset()
		OLD_ENV = {
			UPDATE_STATS: process.env.UPDATE_STATS,
			ADMIN_TOKEN: process.env.ADMIN_TOKEN,
			REDIS_URL: process.env.REDIS_URL
		}
		delete process.env.UPDATE_STATS
		delete process.env.ADMIN_TOKEN
		delete process.env.REDIS_URL
		app = makeApp()
		await _backfill(app as never)
	})

	afterEach(() => {
		if (OLD_ENV.UPDATE_STATS === undefined) delete process.env.UPDATE_STATS
		else process.env.UPDATE_STATS = OLD_ENV.UPDATE_STATS
		if (OLD_ENV.ADMIN_TOKEN === undefined) delete process.env.ADMIN_TOKEN
		else process.env.ADMIN_TOKEN = OLD_ENV.ADMIN_TOKEN
		if (OLD_ENV.REDIS_URL === undefined) delete process.env.REDIS_URL
		else process.env.REDIS_URL = OLD_ENV.REDIS_URL
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
		expect(mockCountInFlight).not.toHaveBeenCalled()
		expect(mockEnqueue).not.toHaveBeenCalled()
	})

	it('returns 401 when admin token does not match', async () => {
		process.env.UPDATE_STATS = '1'
		process.env.ADMIN_TOKEN = 'secret'
		const reply = makeReply()
		await getHandler(app)({ headers: { 'x-admin-token': 'wrong' }, log: mockLog }, reply)
		expect(reply.code).toHaveBeenCalledWith(401)
		expect(mockEnqueue).not.toHaveBeenCalled()
	})

	it('returns 503 when REDIS_URL is not set', async () => {
		process.env.UPDATE_STATS = '1'
		process.env.ADMIN_TOKEN = 'secret'
		const reply = makeReply()
		await getHandler(app)({ headers: validHeaders, log: mockLog }, reply)
		expect(reply.code).toHaveBeenCalledWith(503)
		expect(reply.send).toHaveBeenCalledWith({
			error: 'Service Unavailable',
			message: 'Backfill requires REDIS_URL'
		})
		expect(mockCountInFlight).not.toHaveBeenCalled()
		expect(mockEnqueue).not.toHaveBeenCalled()
	})

	it('returns 409 when a backfill is already in flight', async () => {
		process.env.UPDATE_STATS = '1'
		process.env.ADMIN_TOKEN = 'secret'
		process.env.REDIS_URL = 'redis://127.0.0.1:6379'
		mockCountInFlight.mockResolvedValueOnce(1)
		const reply = makeReply()
		await getHandler(app)({ headers: validHeaders, log: mockLog }, reply)
		expect(reply.code).toHaveBeenCalledWith(409)
		expect(reply.send).toHaveBeenCalledWith({
			error: 'Conflict',
			message: 'Backfill already in progress'
		})
		expect(mockEnqueue).not.toHaveBeenCalled()
	})

	it('returns 202 with the job id when no backfill is in flight', async () => {
		process.env.UPDATE_STATS = '1'
		process.env.ADMIN_TOKEN = 'secret'
		process.env.REDIS_URL = 'redis://127.0.0.1:6379'
		mockCountInFlight.mockResolvedValueOnce(0)
		mockEnqueue.mockResolvedValueOnce('job-7')
		const reply = makeReply()
		await getHandler(app)({ headers: validHeaders, log: mockLog }, reply)
		expect(reply.code).toHaveBeenCalledWith(202)
		expect(reply.send).toHaveBeenCalledWith({ message: 'Ratings backfill started', id: 'job-7' })
		expect(mockEnqueue).toHaveBeenCalledTimes(1)
	})

	it('re-queries the in-flight count per call so consecutive free runs both enqueue', async () => {
		process.env.UPDATE_STATS = '1'
		process.env.ADMIN_TOKEN = 'secret'
		process.env.REDIS_URL = 'redis://127.0.0.1:6379'
		mockCountInFlight.mockResolvedValue(0)
		mockEnqueue.mockResolvedValue('job-1')
		const handler = getHandler(app)
		await handler({ headers: validHeaders, log: mockLog }, makeReply())
		await handler({ headers: validHeaders, log: mockLog }, makeReply())
		expect(mockEnqueue).toHaveBeenCalledTimes(2)
		expect(mockCountInFlight).toHaveBeenCalledTimes(2)
	})
})

afterAll(() => {
	mock.restore()
})
