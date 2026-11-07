import { beforeEach, describe, expect, mock, test } from 'bun:test'

const mockStateFindOne = mock()
const mockRevisionFind = mock()
const mockRevisionFindOne = mock()
const mockArtworkFind = mock()
const mockBooksFind = mock()

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

import { decodeArtworkCursor, decodeCursor, encodeArtworkCursor, encodeCursor } from '#helpers/books/historyCursor'
import { ConflictError, NotFoundError } from '#helpers/errors/ApiErrors'
import BookHistoryHelper from '#helpers/routes/BookHistoryHelper'

const asin = 'B00TEST123'
const region = 'us'
const at = new Date('2026-01-01T00:00:00.000Z')

type Changes = Record<string, { before: unknown; after: unknown } | Array<Record<string, unknown>>>

interface RevisionDoc {
	_id: string
	asin: string
	region: string
	revision: number
	observedAt: Date
	changedFields: string[]
	policies: { fields: Record<string, string>; artwork: Record<string, string> }
	changes: Changes
}

function revisionDoc(revision: number, changes: Changes, changedFields: string[]): RevisionDoc {
	return {
		_id: `rev-${revision}`,
		asin,
		region,
		revision,
		observedAt: at,
		changedFields,
		policies: { fields: { title: 'editorial:title:v1' }, artwork: {} },
		changes
	}
}
const titleChange = (value: string) => ({
	title: { before: { state: 'absent' }, after: { state: 'value', value } }
})

interface ArtworkDoc {
	_id: string
	asin: string
	region: string
	sequence: number
	imageId?: string | null
	unparsedKey?: string
	legacy:
		| { sourceBookId: string; storedUrl: string; importedAt: Date }
		| null
	renditions: Array<Record<string, unknown>>
}
function artworkDoc(sequence: number, extra: Partial<ArtworkDoc> = {}): ArtworkDoc {
	return {
		_id: `asset-${sequence}`,
		asin,
		region,
		sequence,
		legacy: null,
		renditions: [],
		...extra
	}
}
const establishedState = () => ({ _id: `${region}:${asin}`, established: true, fields: [], renditions: [], startedAt: at, revision: 0, assetSequence: 0 })

describe('BookHistoryHelper', () => {
	const helper = new BookHistoryHelper(asin)

	beforeEach(() => {
		mockStateFindOne.mockReset()
		mockRevisionFind.mockReset()
		mockRevisionFindOne.mockReset()
		mockArtworkFind.mockReset()
		mockBooksFind.mockReset()
		mockStateFindOne.mockResolvedValue(null)
		mockBooksFind.mockResolvedValue([])
	})

	describe('listHistory', () => {
		test('404 when neither established state nor a trusted current book exists', async () => {
			mockStateFindOne.mockResolvedValue(null)
			mockBooksFind.mockResolvedValue([])
			await expect(helper.listHistory({ region, limit: 50 })).rejects.toThrow(NotFoundError)
		})

		test('409 on duplicate exact-region candidates without state', async () => {
			mockStateFindOne.mockResolvedValue(null)
			mockBooksFind.mockResolvedValue([{ region }, { region }])
			await expect(helper.listHistory({ region, limit: 50 })).rejects.toThrow(ConflictError)
		})

		test('409 on an unresolved competitor without state', async () => {
			mockStateFindOne.mockResolvedValue(null)
			mockBooksFind.mockResolvedValue([{ region: 'zz' }])
			await expect(helper.listHistory({ region, limit: 50 })).rejects.toThrow(ConflictError)
		})

		test('pending trusted current book without state: 200 with empty items and pending tracking', async () => {
			mockStateFindOne.mockResolvedValue(null)
			mockBooksFind.mockResolvedValue([{ region }])
			mockRevisionFind.mockResolvedValue([])
			const result = await helper.listHistory({ region, limit: 50 })
			expect(result.asin).toBe(asin)
			expect(result.region).toBe(region)
			expect(result.items).toEqual([])
			expect(result.nextCursor).toBeNull()
			expect(result.tracking.status).toBe('pending')
			expect(result.tracking.startedAt).toBeNull()
			expect(result.tracking.artwork).toEqual({})
			for (const name of Object.keys(result.tracking.fields)) {
				expect(result.tracking.fields[name as keyof typeof result.tracking.fields]).toEqual({
					policy: null,
					baselineAt: null
				})
			}
			expect(Object.keys(result.tracking.fields).length).toBe(18)
		})

		test('reservation-only state without a trusted book is unknown (404)', async () => {
			mockStateFindOne.mockResolvedValue({ _id: `${region}:${asin}`, established: false })
			mockBooksFind.mockResolvedValue([])
			await expect(helper.listHistory({ region, limit: 50 })).rejects.toThrow(NotFoundError)
		})

		test('established state alone defines the resource (no current book needed)', async () => {
			mockStateFindOne.mockResolvedValue(establishedState())
			mockBooksFind.mockReset() // must not even need the current book
			mockRevisionFind.mockResolvedValue([])
			const result = await helper.listHistory({ region, limit: 50 })
			expect(result.items).toEqual([])
			expect(result.tracking.status).toBe('pending')
		})

		test('tracks status active with field and rendition baselines', async () => {
			const state = establishedState()
			state.revision = 3
			state.fields = [
				{
					field: 'title',
					policy: 'editorial:title:v1',
					value: { state: 'value', value: 'T' },
					baselineAt: at
				}
			]
			state.renditions = [
				{ rendition: '1024', policy: 'artwork:amazon-id:v1', imageId: 'A', sourceUrl: 'u', baselineAt: at }
			]
			mockStateFindOne.mockResolvedValue(state)
			mockRevisionFind.mockResolvedValue([])
			const result = await helper.listHistory({ region, limit: 50 })
			expect(result.tracking.status).toBe('active')
			expect(result.tracking.startedAt).toBe(at.toISOString())
			expect(result.tracking.fields.title).toEqual({
				policy: 'editorial:title:v1',
				baselineAt: at.toISOString()
			})
			expect(result.tracking.fields.subtitle).toEqual({ policy: null, baselineAt: null })
			expect(result.tracking.artwork['1024']).toEqual({
				policy: 'artwork:amazon-id:v1',
				baselineAt: at.toISOString()
			})
		})

		test('returns the newest-first window with the field filter selecting complete revisions', async () => {
			mockStateFindOne.mockResolvedValue(establishedState())
			const docs: RevisionDoc[] = [
				revisionDoc(3, titleChange('Third'), ['title']),
				revisionDoc(2, titleChange('Second'), ['title', 'artwork']),
				revisionDoc(1, titleChange('First'), ['title'])
			]
			mockRevisionFind.mockResolvedValue(docs)

			const result = await helper.listHistory({ region, limit: 10 })
			expect(result.items.map((item) => item.revision)).toEqual(['3', '2', '1'])
			expect(result.items[0].changedFields).toEqual(['title'])
			expect(result.nextCursor).toBeNull()

			const filtered = await helper.listHistory({ region, limit: 10, field: 'title' })
			expect(filtered.items.map((item) => item.revision)).toEqual(['3', '2', '1'])
		})

		test('paginates with upper bound and exclusive before, encoded from the raw window', async () => {
			mockStateFindOne.mockResolvedValue({
				...establishedState(),
				revision: 5
			})
			const docs: RevisionDoc[] = [
				revisionDoc(5, titleChange('E'), ['title']),
				revisionDoc(4, titleChange('D'), ['title']),
				revisionDoc(3, titleChange('C'), ['title'])
			]
			mockRevisionFind.mockResolvedValueOnce(docs)

			const page1 = await helper.listHistory({ region, limit: 2 })
			expect(page1.nextCursor).toBe(encodeCursor(asin, region, null, 5, 4))
			const filter1 = mockRevisionFind.mock.calls[0][0]
			expect(filter1).toEqual({
				asin,
				region,
				revision: { $lte: 5, $lt: Number.MAX_SAFE_INTEGER }
			})

			const cursor = page1.nextCursor as string
			mockRevisionFind.mockResolvedValueOnce(docs.slice(2))
			const page2 = await helper.listHistory({ region, limit: 10, cursor })
			expect(page2.items.map((item) => item.revision)).toEqual(['3'])
			expect(page2.nextCursor).toBeNull()
			const filter2 = mockRevisionFind.mock.calls[1][0]
			expect(filter2).toEqual({ asin, region, revision: { $lte: 5, $lt: 4 } })
			expect(decodeCursor(cursor, asin, region, null)).toEqual({ upper: 5, before: 4 })
		})

		test('a field filter never advances the cursor past unseen rows', async () => {
			mockStateFindOne.mockResolvedValue({ ...establishedState(), revision: 4 })
			const docs: RevisionDoc[] = [
				revisionDoc(4, { subtitle: { before: { state: 'absent' }, after: { state: 'value', value: 'side' } } }, ['subtitle']),
				revisionDoc(3, titleChange('D'), ['title']),
				revisionDoc(2, titleChange('C'), ['title']),
				revisionDoc(1, titleChange('B'), ['title'])
			]
			mockRevisionFind.mockResolvedValue(docs)
			const result = await helper.listHistory({ region, limit: 2, field: 'title' })
			// Page window is [4,3]; the filtered display is [3]; the cursor
			// must be encoded from the raw last row (3), not the filtered one.
			expect(result.items.map((item) => item.revision)).toEqual(['3'])
			expect(result.nextCursor).toBe(encodeCursor(asin, region, 'title', 4, 3))
		})

		test('a bad cursor throws a 400-class error', async () => {
			mockStateFindOne.mockResolvedValue(establishedState())
			await expect(
				helper.listHistory({ region, limit: 10, cursor: '!!!' })
			).rejects.toThrow('Invalid cursor')
		})
	})

	describe('getRevision', () => {
		test('returns the full stored delta including the mixed artwork list', async () => {
			mockStateFindOne.mockResolvedValue(establishedState())
			const doc = revisionDoc(
				2,
				{
					...titleChange('Second'),
					artwork: [
						{
							rendition: '1024',
							before: { imageId: 'AAA', sourceUrl: 'https://old.example/AAA' },
							after: { imageId: 'BBB', sourceUrl: 'https://new.example/BBB' }
						}
					]
				},
				['title', 'artwork']
			)
			mockRevisionFindOne.mockResolvedValue(doc)
			const result = await helper.getRevision(region, 2)
			expect(result.asin).toBe(asin)
			expect(result.region).toBe(region)
			expect(result.revision).toBe(2)
			expect(result.observedAt).toBe(at.toISOString())
			expect(result.changedFields).toEqual(['title', 'artwork'])
			expect(result.changes.title?.after).toEqual({ state: 'value', value: 'Second' })
			expect(result.changes.artwork).toEqual([
				{
					rendition: '1024',
					before: { imageId: 'AAA', sourceUrl: 'https://old.example/AAA' },
					after: { imageId: 'BBB', sourceUrl: 'https://new.example/BBB' }
				}
			])
		})

		test('404s for missing resources and missing revisions', async () => {
			mockStateFindOne.mockResolvedValue(null)
			mockBooksFind.mockResolvedValue([])
			await expect(helper.getRevision(region, 1)).rejects.toThrow(NotFoundError)

			mockStateFindOne.mockResolvedValue({ _id: `${region}:${asin}`, established: true })
			mockRevisionFindOne.mockResolvedValue(null)
			// detail does not consult current books once state is established
			await expect(helper.getRevision(region, 99)).rejects.toThrow(
				`History revision 99 not found for book ${asin}`
			)
		})
	})

	describe('listArtwork', () => {
		test('lists entries newest sequence first, with legacy null times', async () => {
			mockStateFindOne.mockResolvedValue({ ...establishedState(), assetSequence: 3 })
			const renditions = [
				{
					rendition: 'default',
					firstSourceUrl: 'https://a.example/1.jpg',
					sourceUrl: 'https://a.example/2.jpg',
					firstObservedAt: at,
					observedAt: at
				}
			]
			const docs: ArtworkDoc[] = [
				artworkDoc(3, { imageId: 'CCC' }),
				artworkDoc(2, {
					legacy: {
						sourceBookId: 'deadbeefdeadbeefdeadbeef',
						storedUrl: 'https://legacy.example/old.png',
						importedAt: at
					}
				}),
				artworkDoc(1, { imageId: 'AAA', renditions })
			]
			mockArtworkFind.mockResolvedValue(docs)
			const result = await helper.listArtwork({ region, limit: 3 })
			expect(result.items.map((item) => item.assetId)).toEqual([
				'asset-3',
				'asset-2',
				'asset-1'
			])
			expect(result.items[0].imageId).toBe('CCC')
			expect(result.items[1].legacy).toEqual({
				storedUrl: 'https://legacy.example/old.png',
				importedAt: at.toISOString(),
				observedAt: null,
				rendition: null
			})
			expect(result.nextCursor).toBeNull()
			const filter = mockArtworkFind.mock.calls[0][0]
			expect(filter).toEqual({
				asin,
				region,
				sequence: { $lte: 3, $lt: Number.MAX_SAFE_INTEGER }
			})
		})

		test('paginates newest-first with the stored upper bound', async () => {
			mockStateFindOne.mockResolvedValue({ ...establishedState(), assetSequence: 4 })
			const docs: ArtworkDoc[] = [artworkDoc(4), artworkDoc(3), artworkDoc(2)]
			mockArtworkFind.mockResolvedValueOnce(docs)
			const page1 = await helper.listArtwork({ region, limit: 2 })
			expect(page1.items.map((item) => item.assetId)).toEqual(['asset-4', 'asset-3'])
			expect(page1.nextCursor).toBe(encodeArtworkCursor(asin, region, 4, 3))
			const filter1 = mockArtworkFind.mock.calls[0][0]
			expect(filter1).toEqual({ asin, region, sequence: { $lte: 4, $lt: Number.MAX_SAFE_INTEGER } })

			const cursor = page1.nextCursor as string
			expect(decodeArtworkCursor(cursor, asin, region)).toEqual({ upper: 4, before: 3 })
			mockArtworkFind.mockResolvedValueOnce([artworkDoc(2)])
			const page2 = await helper.listArtwork({ region, limit: 10, cursor })
			expect(page2.items.map((item) => item.assetId)).toEqual(['asset-2'])
			expect(page2.nextCursor).toBeNull()
		})

		test('pending resource: 200 with empty items; unknown: 404', async () => {
			mockStateFindOne.mockResolvedValue(null)
			mockBooksFind.mockResolvedValue([{ region }])
			mockArtworkFind.mockResolvedValue([])
			const pending = await helper.listArtwork({ region, limit: 50 })
			expect(pending.items).toEqual([])
			expect(pending.tracking.status).toBe('pending')

			mockBooksFind.mockResolvedValue([])
			await expect(helper.listArtwork({ region, limit: 50 })).rejects.toThrow(NotFoundError)
		})
	})
})
