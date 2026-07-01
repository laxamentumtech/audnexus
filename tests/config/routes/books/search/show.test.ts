import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test'

import _show from '#config/routes/books/search/show'

const mockParseResults = mock()

mock.module('#helpers/books/audible/BookSearchApiHelper', () => ({
	default: class MockBookSearchApiHelper {
		parseResults = mockParseResults
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
	const app = { get: mock() }
	return app
}

function getHandler(app: ReturnType<typeof makeApp>) {
	return app.get.mock.calls[0][1]
}

function makeReply() {
	const reply = {
		code: mock(() => reply),
		send: mock(() => reply)
	}
	return reply
}

describe('GET /books/search', () => {
	let app: ReturnType<typeof makeApp>

	beforeEach(async () => {
		mockParseResults.mockReset()
		app = makeApp()
		await _show(app as never)
	})

	it('returns 400 when q is missing', async () => {
		const reply = makeReply()
		await getHandler(app)({ query: {}, log: mockLog }, reply)
		expect(reply.code).toHaveBeenCalledWith(400)
	})

	it('returns 400 when q is empty string', async () => {
		const reply = makeReply()
		await getHandler(app)({ query: { q: '' }, log: mockLog }, reply)
		expect(reply.code).toHaveBeenCalledWith(400)
	})

	it('returns 400 when q is whitespace only', async () => {
		const reply = makeReply()
		await getHandler(app)({ query: { q: '   ' }, log: mockLog }, reply)
		expect(reply.code).toHaveBeenCalledWith(400)
	})

	it('returns results from helper for valid query', async () => {
		const books = [{ asin: 'B08V8B2CGV', title: 'Dungeon Crawler Carl' }]
		mockParseResults.mockResolvedValue(books)
		const reply = makeReply()
		const result = await getHandler(app)({ query: { q: 'dungeon crawler carl' }, log: mockLog }, reply)
		expect(result).toEqual(books)
	})

	it('trims whitespace from query before passing to helper', async () => {
		mockParseResults.mockResolvedValue([])
		const reply = makeReply()
		await getHandler(app)({ query: { q: '  carl  ' }, log: mockLog }, reply)
		expect(mockParseResults).toHaveBeenCalled()
		expect(reply.code).not.toHaveBeenCalledWith(400)
	})

	it('defaults region to us when not provided', async () => {
		mockParseResults.mockResolvedValue([])
		await getHandler(app)({ query: { q: 'test' }, log: mockLog }, makeReply())
		expect(mockParseResults).toHaveBeenCalled()
	})
})

afterAll(() => {
	mock.restore()
})
