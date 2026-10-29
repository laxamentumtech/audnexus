// Real Fastify injection against the shared structured error handler and a
// controlled DB boundary: the three history routes use the production query
// allowlists, the 400/404/409 response envelope, and the helper's existence
// rules. DB reads are mocked at the model boundary, filter-aware enough to
// mirror the real store's selectivity for these shapes.

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { fastify, type FastifyInstance } from 'fastify'

import { registerApiErrorHandler } from '#config/errorHandler'
import bookArtwork from '#config/routes/books/artwork'
import bookHistory from '#config/routes/books/history'
import bookHistoryDetail from '#config/routes/books/historyDetail'

const ASIN = 'B00TEST123'
const UNKNOWN_ASIN = 'B00NOBOOK9'
const at = '2026-01-01T00:00:00.000Z'
const revisionRow = {
	revision: 3,
	observedAt: new Date(at),
	changedFields: ['title', 'artwork']
}

let established = false
let trusted = false
let revisionDocs: typeof revisionRow[] = [revisionRow]

const defaultArtworkAsset = {
	_id: 'asset-2',
	asin: ASIN,
	region: 'us',
	sequence: 2,
	imageId: 'CCC',
	legacy: null,
	renditions: []
}
const mockStateFindOne = mock()
const mockBooksFind = mock()
const mockRevisionFind = mock()
const mockRevisionFindOne = mock()
const mockArtworkFind = mock()
function defaultImplementations() {
	mockStateFindOne.mockImplementation(() =>
		Promise.resolve(
			established
				? {
						_id: `us:${ASIN}`,
						established: true,
						revision: 3,
						assetSequence: 2,
						fields: [],
						renditions: []
					}
				: null
		)
	)
	mockBooksFind.mockImplementation(
		(filter: { asin?: string }) =>
			Promise.resolve(filter?.asin === ASIN && trusted ? [{ region: 'us' }] : [])
	)
	mockRevisionFind.mockImplementation((filter: { revision?: { $lte?: number; $lt?: number } } | null) => {
		const upper = filter?.revision?.$lte ?? Number.MAX_SAFE_INTEGER
		const before = filter?.revision?.$lt ?? Number.MAX_SAFE_INTEGER
		return Promise.resolve(
			revisionDocs
				.filter((doc) => doc.revision <= upper && doc.revision < before)
				.sort((a: { revision: number }, b: { revision: number }) => b.revision - a.revision)
		)
	})
	mockRevisionFindOne.mockImplementation(() => Promise.resolve(revisionDocs[0] ?? null))
	mockArtworkFind.mockImplementation(() => Promise.resolve([defaultArtworkAsset]))
}

mock.module('#config/models/Book', () => ({
	default: { name: 'Book', find: mockBooksFind }
}))
mock.module('#config/models/BookHistory', () => ({
	BookHistoryStateModel: { name: 'BookHistoryStateModel', findOne: mockStateFindOne },
	BookHistoryRevisionModel: {
		name: 'BookHistoryRevisionModel',
		find: mockRevisionFind,
		findOne: mockRevisionFindOne
	},
	BookArtworkModel: { name: 'BookArtworkModel', find: mockArtworkFind }
}))

function makeApp(): FastifyInstance {
	const app = fastify({ logger: false, disableRequestLogging: true })
	registerApiErrorHandler(app)
	void app.register(bookHistory)
	void app.register(bookHistoryDetail)
	void app.register(bookArtwork)
	return app
}

describe('history routes (injection)', () => {
	let app: FastifyInstance
	beforeEach(async () => {
		established = false
		trusted = false
		revisionDocs = [revisionRow]
		defaultImplementations()
		app = makeApp()
		await app.ready()
	})
	afterEach(async () => {
		await app.close()
	})

	test('list: established resource returns the envelope newest-first', async () => {
		established = true
		const res = await app.inject({ method: 'GET', url: `/books/${ASIN}/history` })
		expect(res.statusCode).toBe(200)
		const body = res.json()
		expect(body.asin).toBe(ASIN)
		expect(body.region).toBe('us')
		expect(body.items.map((item: { revision: string }) => item.revision)).toEqual(['3'])
		expect(body.tracking.status).toBe('pending')
		expect(body.tracking.fields.title.policy).toBeNull()
		expect(body.nextCursor).toBeNull()
	})

	test('list: pending trusted current book returns empty items', async () => {
		trusted = true
		const res = await app.inject({ method: 'GET', url: `/books/${ASIN}/history` })
		expect(res.statusCode).toBe(200)
		expect(res.json().items).toEqual([])
		expect(res.json().tracking.status).toBe('pending')
	})

	test('list: wholly unknown resource is 404 NOT_FOUND', async () => {
		const res = await app.inject({ method: 'GET', url: `/books/${UNKNOWN_ASIN}/history` })
		expect(res.statusCode).toBe(404)
		expect(res.json().error.code).toBe('NOT_FOUND')
	})

	test('list: unresolved identity conflict is 409 CONFLICT', async () => {
		mockBooksFind.mockImplementation(() => Promise.resolve([{ region: 'zz' }, { region: 'zz' }]))
		const res = await app.inject({ method: 'GET', url: `/books/${ASIN}/history` })
		expect(res.statusCode).toBe(409)
		expect(res.json().error.code).toBe('CONFLICT')
	})

	test('invalid inputs are structured 400s', async () => {
		const badUrl = [
			`/books/nope/history`,
			`/books/${ASIN}/history?field=rating`,
			`/books/${ASIN}/history?limit=0`,
			`/books/${ASIN}/history?limit=101`,
			`/books/${ASIN}/history?limit=abc`,
			`/books/${ASIN}/history?region=zz`,
			`/books/${ASIN}/history?update=1`,
			`/books/${ASIN}/history?seedAuthors=1`,
			`/books/${ASIN}/history?name=x`,
			`/books/${ASIN}/history?limit=10%2C20`,
			`/books/${ASIN}/history?field=title%2Cartwork`,
			`/books/${ASIN}/history?cursor=${'a'.repeat(2049)}`
		]
		for (const url of badUrl) {
			const res = await app.inject({ method: 'GET', url })
			expect(res.statusCode, `expected 400 for ${url}`).toBe(400)
			expect(res.json().error.code).toBe('BAD_REQUEST')
		}
	})

	test('list: malformed and cross-concern cursors are 400 on an established resource', async () => {
		established = true
		const bogus = Buffer.from(
			JSON.stringify({
				v: 1,
				kind: 'artwork',
				asin: ASIN,
				region: 'us',
				upper: 1,
				before: 1
			}),
			'utf8'
		).toString('base64url')
		for (const cursor of ['!!!', bogus]) {
			const res = await app.inject({
				method: 'GET',
				url: `/books/${ASIN}/history?cursor=${cursor}`
			})
			expect(res.statusCode, `expected 400 for cursor ${cursor}`).toBe(400)
			expect(res.json().error.code).toBe('BAD_REQUEST')
		}
	})

	test('list: invalid cursor on a nonexistent resource is 404 (existence precedes cursor)', async () => {
		const res = await app.inject({
			method: 'GET',
			url: `/books/${UNKNOWN_ASIN}/history?cursor=!!!`
		})
		expect(res.statusCode).toBe(404)
		expect(res.json().error.code).toBe('NOT_FOUND')
	})

	test('detail: returns the entire stored mixed revision', async () => {
		established = true
		mockRevisionFindOne.mockResolvedValue({
			revision: 3,
			observedAt: new Date(at),
			changedFields: ['title', 'artwork'],
			policies: { fields: {}, artwork: {} },
			changes: {
				title: { before: { state: 'absent' }, after: { state: 'value', value: 'U' } },
				artwork: [
					{
						rendition: '1024',
						before: { imageId: 'AAA', sourceUrl: 'https://old.example/AAA' },
						after: { imageId: 'BBB', sourceUrl: 'https://new.example/BBB' }
					}
				]
			}
		})
		const res = await app.inject({ method: 'GET', url: `/books/${ASIN}/history/3` })
		expect(res.statusCode).toBe(200)
		const body = res.json()
		expect(body.revision).toBe(3)
		expect(body.changedFields).toEqual(['title', 'artwork'])
		expect(body.changes.title.after).toEqual({ state: 'value', value: 'U' })
		expect(body.changes.artwork[0].rendition).toBe('1024')
	})

	test('detail: unknown revision is 404 even on a pending trusted resource', async () => {
		trusted = true
		mockRevisionFindOne.mockResolvedValue(null)
		const res = await app.inject({ method: 'GET', url: `/books/${ASIN}/history/9?region=us` })
		expect(res.statusCode).toBe(404)
		expect(res.json().error.code).toBe('NOT_FOUND')
	})

	test('detail: bad revision shapes are 400', async () => {
		established = true
		for (const revision of ['0', '01', '9007199254740992', 'abc']) {
			const res = await app.inject({ method: 'GET', url: `/books/${ASIN}/history/${revision}` })
			expect(res.statusCode, `expected 400 for revision ${revision}`).toBe(400)
		}
	})

	test('artwork: pending resource 200 empty; unknown 404; extra key 400', async () => {
		trusted = true
		mockArtworkFind.mockResolvedValue([])
		const pending = await app.inject({ method: 'GET', url: `/books/${ASIN}/artwork` })
		expect(pending.statusCode).toBe(200)
		expect(pending.json().items).toEqual([])

		const unknown = await app.inject({ method: 'GET', url: `/books/${UNKNOWN_ASIN}/artwork` })
		expect(unknown.statusCode).toBe(404)
		expect(unknown.json().error.code).toBe('NOT_FOUND')

		const extra = await app.inject({ method: 'GET', url: `/books/${ASIN}/artwork?update=1` })
		expect(extra.statusCode).toBe(400)
	})

	test('artwork: established resource lists with metadata only', async () => {
		established = true
		const res = await app.inject({ method: 'GET', url: `/books/${ASIN}/artwork` })
		expect(res.statusCode).toBe(200)
		const body = res.json()
		expect(body.items).toHaveLength(1)
		expect(body.items[0].assetId).toBe('asset-2')
		expect(body.items[0].legacy).toBeNull()
		expect(body.tracking.recordingEnabled).toBe(false)
	})
})

