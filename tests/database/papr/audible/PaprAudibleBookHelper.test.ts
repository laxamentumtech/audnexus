import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'

import { createMockLogger } from '#tests/setup/mockLogger'

const mockUpdateOne = mock()
const mockFindOne = mock()
const mockInsertOne = mock()
const mockDeleteOne = mock()
const mockFind = mock()

mock.module('#config/models/Book', () => ({
	default: {
		updateOne: mockUpdateOne,
		findOne: mockFindOne,
		insertOne: mockInsertOne,
		deleteOne: mockDeleteOne,
		find: mockFind
	}
}))

const mockIsEqualData = mock()

mock.module('#helpers/utils/shared', () => ({
	default: class SharedHelper {
		isEqualData = mockIsEqualData
	}
}))

import type { FastifyBaseLogger } from 'fastify'

import type { BookDocument } from '#config/models/Book'
import { ApiBookSchema, ApiQueryString } from '#config/types'
import * as checkers from '#config/typing/checkers'
import PaprAudibleBookHelper from '#helpers/database/papr/audible/PaprAudibleBookHelper'
import {
	bookWithoutGenresWithoutProjection,
	bookWithoutProjection,
	parsedBook,
	parsedBookWithoutGenres,
	ratings
} from '#tests/datasets/helpers/books'


/**
 * The aggregation-pipeline update a ratings-bearing write issues: every
 * evidence value is stored as a `$literal` (plain catalog data, never an
 * expression), the incoming ratings ride as a `$mergeObjects` merge over
 * the stored `ratings`, and the driver computes `updatedAt` (`$currentDate`
 * is not a pipeline stage).
 */
const expectedRatingsPipeline = (
	evidence: Record<string, unknown>
): Record<string, unknown>[] => {
	const evidenceLiterals: Record<string, unknown> = {}
	for (const [field, value] of Object.entries(evidence)) {
		evidenceLiterals[field] = { $literal: value }
	}
	return [
		{
			$set: {
				...evidenceLiterals,
				ratings: {
					$mergeObjects: [
						{
							$cond: [
								{ $eq: [{ $type: '$ratings' }, 'object'] },
								'$ratings',
								{}
							]
						},
						{
							value: ratings.value,
							numRatings: ratings.numRatings,
							numReviews: ratings.numReviews,
							distribution: ratings.distribution,
							performanceDistribution: ratings.performanceDistribution,
							storyDistribution: ratings.storyDistribution
						}
					]
				},
				createdAt: bookWithoutProjection._id.getTimestamp(),
				updatedAt: expect.any(Date)
			}
		},
		{ $unset: ['ratingsBackfillSkip'] }
	]
}

let asin: string
let helper: PaprAudibleBookHelper
let options: ApiQueryString

beforeEach(() => {
	mockUpdateOne.mockReset()
	mockFindOne.mockReset()
	mockInsertOne.mockReset()
	mockDeleteOne.mockReset()
	mockFind.mockReset()
	mockIsEqualData.mockReset()
	asin = parsedBook.asin
	options = {
		region: 'us',
		seedAuthors: undefined,
		update: '1'
	}
	helper = new PaprAudibleBookHelper(asin, options)

	mockUpdateOne.mockResolvedValue({
		acknowledged: true,
		matchedCount: 1,
		modifiedCount: 1,
		upsertedCount: 0,
		upsertedId: bookWithoutProjection._id
	})
	mockFindOne.mockResolvedValue(bookWithoutProjection)
	mockInsertOne.mockResolvedValue(bookWithoutProjection)
	spyOn(checkers, 'isBookDocument').mockReturnValue(true)
})

describe('PaprAudibleBookHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.options).toBe(options)
	})
	test('create', async () => {
		const obj = { data: parsedBook, modified: true }
		mockFindOne.mockResolvedValueOnce(parsedBook as unknown as BookDocument)
		helper.setData(parsedBook)

		await expect(helper.create()).resolves.toEqual(obj)
		expect(mockInsertOne).toHaveBeenCalledWith(parsedBook)
		expect(mockFindOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('delete', async () => {
		const obj = { data: { acknowledged: true, deletedCount: 1 }, modified: true }
		mockDeleteOne.mockResolvedValue(obj.data)
		await expect(helper.delete()).resolves.toEqual(obj)
		expect(mockDeleteOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOne', async () => {
		const obj = { data: bookWithoutProjection, modified: false }
		await expect(helper.findOne()).resolves.toEqual(obj)
		expect(mockFindOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOne returns null if it is not a BookDocument', async () => {
		const obj = { data: null, modified: false }
		mockFindOne.mockResolvedValueOnce(null)
		spyOn(checkers, 'isBookDocument').mockReturnValueOnce(false)
		await expect(helper.findOne()).resolves.toEqual(obj)
		expect(mockFindOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOneWithProjection', async () => {
		const obj = { data: parsedBook, modified: false }
		mockFindOne.mockResolvedValue(parsedBook as unknown as BookDocument)
		await expect(helper.findOneWithProjection()).resolves.toEqual(obj)
		expect(mockFindOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOneWithProjection returns null if it is not a Book', async () => {
		const obj = { data: null, modified: false }
		mockFindOne.mockResolvedValueOnce(null)
		await expect(helper.findOneWithProjection()).resolves.toEqual(obj)
		expect(mockFindOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('setData', () => {
		const bookData = parsedBook
		helper.setData(bookData)
		expect(helper.bookData).toBe(bookData)
	})
	test('createOrUpdate finds one to update', async () => {
		const obj = { data: parsedBook, modified: true }
		// Every read returns the _id-carrying row: the projections parse
		// to parsedBook, and the raw reads expose _id to the write.
		mockFindOne.mockResolvedValue(bookWithoutProjection)
		helper.setData(parsedBook)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate finds identical update data', async () => {
		const obj = { data: parsedBook, modified: false }
		mockFindOne
			.mockResolvedValueOnce(bookWithoutProjection) // raw row read (projection + _id)
			.mockResolvedValue(parsedBook as unknown as BookDocument) // T0 projection
		mockIsEqualData.mockReturnValue(true)
		helper.setData(parsedBook)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
		// The conditional marker-unset targets the compared row by _id:
		// a region-less sibling row is never unset by a region-scoped
		// equality comparison.
		expect(mockUpdateOne).toHaveBeenCalledTimes(1)
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ _id: bookWithoutProjection._id, ratingsBackfillSkip: { $exists: true } },
			{ $unset: { ratingsBackfillSkip: '' } }
		)
	})
	test('createOrUpdate needs to create', async () => {
		const obj = { data: parsedBook, modified: true }
		mockFindOne.mockResolvedValueOnce(null)
		mockFindOne.mockResolvedValue(bookWithoutProjection)
		helper.setData(parsedBook)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate difference in genres', async () => {
		const obj = { data: parsedBook, modified: true }
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(bookWithoutProjection) // raw row read (projection + _id)
			.mockResolvedValueOnce(bookWithoutProjection) // fresh read in update() (raw, _id for createdAt)
			.mockResolvedValue(parsedBook as unknown as BookDocument) // post-update read
		helper.setData(parsedBook)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate empty incoming genres keep stored row', async () => {
		// No genre gate: the effective write retains stored genres, so the
		// projection is unchanged and no update is performed.
		const obj = { data: parsedBook, modified: false }
		mockIsEqualData.mockReturnValue(true)
		mockFindOne
			.mockResolvedValueOnce(bookWithoutProjection) // raw row read (projection + _id)
			.mockResolvedValue(parsedBook as unknown as BookDocument) // T0 projection
		helper.setData(parsedBookWithoutGenres)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate preserves stored genres when the incoming book has none', async () => {
		// Regression (skipHtml background passes): a stored book with
		// genres is re-fetched as a genre-less product (no category
		// ladders, no HTML scrape). The stored genres must be preserved
		// so the remaining changed fields persist through the genre
		// safeguard — previously the WHOLE update was rejected, freezing
		// title/ratings while the scheduler marked the row checked and
		// re-hit the same rejection every pass.
		const incoming = { ...parsedBookWithoutGenres, summary: '' }
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(bookWithoutProjection) // raw row read (projection + _id)
			.mockResolvedValueOnce(bookWithoutProjection) // fresh read in update() (raw, _id for createdAt)
			.mockResolvedValue(parsedBook as unknown as BookDocument) // post-update read
		helper.setData(incoming)
		const result = await helper.createOrUpdate()
		expect(result).toEqual({ data: parsedBook, modified: true })
		// Evidence-only write: the changed field (summary) rides along, but
		// the empty incoming genres carry no genre evidence, so genres is
		// ABSENT from the $set — MongoDB leaves the stored ladder untouched
		// and a concurrent refresh is never restored from a stale snapshot.
		expect(mockUpdateOne).toHaveBeenCalledTimes(1)
		const update = mockUpdateOne.mock.calls[0][1] as { $set: Record<string, unknown> }[]
		expect(update[0].$set.summary).toEqual({ $literal: '' })
		expect(update[0].$set).not.toHaveProperty('genres')
		// The stored genres survive the write: the post-update read returns
		// the row with its stored ladder intact.
		expect(result.data?.genres).toEqual(parsedBook.genres)
	})
	test('createOrUpdate does not clobber concurrent genres on a genre-less update', async () => {
		// Concurrent-refresh regression: the stored row carries genres A,
		// the incoming book is genre-less (a skipHtml background pass),
		// and a concurrent genre refresh stores genres B on the row
		// BEFORE update() re-reads it (the fresh read the effective
		// write is rebuilt against), so the write carries the fresh
		// genres B, never a stale stored copy.
		const genresB = [{ type: 'genre', asin: '9876543210', name: 'Mystery' }]
		const refreshed = {
			...bookWithoutProjection,
			genres: genresB
		} as BookDocument
		const incoming = { ...parsedBookWithoutGenres, summary: '' }
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(bookWithoutProjection) // raw row read (projection + _id)
			.mockResolvedValueOnce(refreshed as unknown as BookDocument) // fresh read in update() (raw, _id for createdAt)
			.mockResolvedValue(refreshed) // post-update read
		helper.setData(incoming)
		const result = await helper.createOrUpdate()
		expect(result.modified).toBe(true)
		// The final read sees the concurrently refreshed genres.
		expect(result.data).toEqual({ ...parsedBook, genres: genresB })
		// Evidence-only write: the empty incoming genres carry no genre
		// evidence, so genres is ABSENT from the $set — the concurrently
		// refreshed row's genres B are never clobbered by a stale snapshot
		// and the stored value survives the write.
		expect(mockUpdateOne).toHaveBeenCalledTimes(1)
		const update = mockUpdateOne.mock.calls[0][1] as { $set: Record<string, unknown> }[]
		expect(update[0].$set.summary).toEqual({ $literal: '' })
		expect(update[0].$set).not.toHaveProperty('genres')
		expect(result.data?.genres).toEqual(genresB)
	})
	test('createOrUpdate identical book without genres', async () => {
		// No genre gate: identical projections short-circuit to no update.
		const obj = { data: parsedBookWithoutGenres, modified: false }
		mockIsEqualData.mockReturnValue(true)
		mockFindOne
			.mockResolvedValueOnce(bookWithoutGenresWithoutProjection) // raw row read (projection + _id)
			.mockResolvedValue(parsedBookWithoutGenres as unknown as BookDocument) // T0 projection
		helper.setData(parsedBookWithoutGenres)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate empty incoming genres list does not clobber stored genres in the write', async () => {
		// Incoming `genres: []` is not genre evidence, and the ratings
		// change means the equality short-circuit fails (the comparator is
		// mocked false, as in the genre-difference test). The update must
		// proceed with an evidence-only $set: the incoming defined fields
		// ride along, genres is absent, and the stored genres survive
		// untouched.
		const incoming = { ...parsedBookWithoutGenres, genres: [], ratings: { ...ratings } }
		// The ratings-bearing write is a pipeline: the incoming ratings ride
		// as a `$mergeObjects` merge, and the empty `genres` carries no
		// evidence, so `genres` is absent from the $set.
		const { genres: _noEvidenceGenres, ...incomingWithoutGenres } = incoming
		void _noEvidenceGenres
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(bookWithoutProjection) // raw row read (projection + _id)
			.mockResolvedValue(bookWithoutProjection) // update() read + post-update
		helper.setData(incoming)
		const result = await helper.createOrUpdate()
		expect(result.modified).toBe(true)
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin, $or: [{ region: { $exists: false } }, { region: options.region }] },
			expectedRatingsPipeline(incomingWithoutGenres)
		)
		// genres is absent from the $set, so the stored ladder survives.
		const update = mockUpdateOne.mock.calls[0][1] as { $set: Record<string, unknown> }[]
		expect(update[0].$set).not.toHaveProperty('genres')
		expect(result.data?.genres).toEqual(parsedBook.genres)
	})
	test('createOrUpdate short-circuits when incoming has no genre evidence and everything else matches', async () => {
		// Stored row has genres, incoming is identical except the genre-less
		// fetch carries no genre evidence: the effective write keeps the
		// stored genres and equals the stored row, so modified: false.
		const incoming = { ...parsedBookWithoutGenres, genres: [] }
		const obj = { data: parsedBook, modified: false }
		mockIsEqualData.mockReturnValue(true)
		mockFindOne
			.mockResolvedValueOnce(bookWithoutProjection) // raw row read (projection + _id)
			.mockResolvedValue(parsedBook as unknown as BookDocument) // T0 projection
		helper.setData(incoming)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
		expect(mockIsEqualData).toHaveBeenCalledTimes(1)
		expect(mockIsEqualData).toHaveBeenCalledWith(
			parsedBook,
			{ ...incoming, genres: parsedBook.genres }
		)
	})
	test('createOrUpdate short-circuits when both sides carry an empty genre list', async () => {
		// `genres: []` is not genre evidence on either side: an identical
		// genre-less observation compares equal once the empty lists are
		// normalized away, so it stays in the short-circuit (modified:
		// false) instead of a redundant $set on every fetch.
		const incoming = { ...parsedBookWithoutGenres, genres: [] }
		const stored: BookDocument = {
			...bookWithoutProjection,
			genres: []
		}
		// The short-circuit returns the stored projection as-is, which
		// keeps its `genres: []` key.
		const obj = { data: { ...parsedBookWithoutGenres, genres: [] }, modified: false }
		mockIsEqualData.mockReturnValue(true)
		mockFindOne.mockResolvedValue(stored as unknown as BookDocument)
		helper.setData(incoming)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
		expect(mockIsEqualData).toHaveBeenCalledTimes(1)
		// The stored `genres: []` key survives on both comparison copies:
		// the row keeps the key and the effective write retains it.
		expect(mockIsEqualData).toHaveBeenCalledWith(
			{ ...parsedBookWithoutGenres, genres: [] },
			{ ...parsedBookWithoutGenres, genres: [] }
		)
	})
	test('createOrUpdate updates when neither side has genres', async () => {
		// Genre-less legacy rows must still accept other fields (ratings):
		// with no stored genres there is nothing the update could nuke.
		const obj = { data: parsedBookWithoutGenres, modified: true }
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(parsedBookWithoutGenres as unknown as BookDocument)
			.mockResolvedValue(bookWithoutGenresWithoutProjection) // raw reads + post-update
		helper.setData(parsedBookWithoutGenres)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
		expect(mockUpdateOne).toHaveBeenCalledTimes(1)
	})
	test('update', async () => {
		const obj = { data: parsedBook, modified: true }
		helper.setData(parsedBook)
		// The raw read must carry `_id` (the write derives `createdAt` from
		// the row's ObjectId timestamp) and feeds the post-update read.
		mockFindOne.mockResolvedValue(bookWithoutProjection)
		await expect(helper.update()).resolves.toEqual(obj)
		// Evidence-only write: the incoming book's own fields ride as
		// `$literal` values, and the ratings block rides as a `$mergeObjects`
		// merge — a concurrent Goodreads change is never clobbered by a
		// whole-object rewrite.
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin: asin, $or: [{ region: { $exists: false } }, { region: options.region }] },
			expectedRatingsPipeline(parsedBook)
		)
	})
	test('update keeps stored Goodreads when the incoming ratings block omits it', async () => {
		// Legacy-row regression: the stored document carries a Goodreads
		// value the fresh fetch's ratings block does not have. The ratings
		// write is a `$mergeObjects` merge over the stored `ratings` object,
		// so the stored Goodreads is left untouched by the write.
		const storedGoodreads = { value: 4.2, numRatings: 4210 }
		const storedRatings = { ...ratings, goodreads: storedGoodreads }
		// A LEGACY row: a non-URL `image` makes it fail the full `ApiBookSchema`
		// parse, so the old merge-from-stored branch (stored=null) would have
		// dropped the Goodreads on the whole-object rewrite. Proven below.
		const storedDoc = {
			...bookWithoutProjection,
			image: 'legacy-not-a-url',
			ratings: storedRatings
		} as unknown as BookDocument
		expect(ApiBookSchema.safeParse(storedDoc).success).toBe(false)
		const incoming = { ...parsedBook, ratings: { ...ratings } }
		mockFindOne.mockResolvedValueOnce(storedDoc)
		mockFindOne.mockResolvedValue(parsedBook as unknown as BookDocument)
		helper.setData(incoming)
		const result = await helper.update()
		expect(result.modified).toBe(true)
		expect(mockUpdateOne).toHaveBeenCalledTimes(1)
		const update = mockUpdateOne.mock.calls[0][1] as { $set: Record<string, unknown> }[]
		// The `ratings` object is rewritten only by the merge: no
		// `ratings.goodreads` sub-field is carried by the merge, so the
		// stored Goodreads survives.
		expect(update[0].$set).toHaveProperty('ratings')
		const ratingsMerge = update[0].$set.ratings as unknown as Record<string, unknown>
		const mergeObjects = ratingsMerge.$mergeObjects as unknown as Record<string, unknown>[]
		expect(mergeObjects).toHaveLength(2)
		expect(mergeObjects[1]).not.toHaveProperty('goodreads')
		expect(mergeObjects[1]).not.toHaveProperty('ratings.goodreads')
		// The observed rating fields land in the merge.
		expect(mergeObjects[1]).toMatchObject({
			value: ratings.value,
			numRatings: ratings.numRatings
		})
	})
	test('createOrUpdate tags-only change persists the effective write', async () => {
		// A tags-only change is a real update even when genres are unchanged:
		// the evidence-only write $sets the incoming values (new tags and
		// every other incoming field) and targets the compared row by _id.
		const stored = parsedBook as unknown as Record<string, unknown>
		const newTags = [{ tagId: 't1', name: 'Witty', type: 'mood' as const }]
		const incoming = { ...parsedBook, tags: newTags }
		// The ratings-bearing write is a pipeline: the incoming ratings ride
		// as a `$mergeObjects` merge, and the non-empty genres ARE evidence,
		// so they ride along as a real (literal) key.
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(bookWithoutProjection) // raw row read (projection + _id)
			.mockResolvedValueOnce(bookWithoutProjection) // fresh read in update() (raw, _id for createdAt)
			.mockResolvedValue(stored as unknown as BookDocument) // post-update read
		helper.setData(incoming as typeof parsedBook)
		const result = await helper.createOrUpdate()
		expect(result.modified).toBe(true)
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin, $or: [{ region: { $exists: false } }, { region: options.region }] },
			expectedRatingsPipeline(incoming)
		)
	})
	test('createOrUpdate empty incoming genres keep stored genres in the write', async () => {
		// Genres retention: an empty incoming genres array is no genre
		// evidence, so it is ABSENT from the evidence-only $set and the
		// stored ladder is never nuked; a title change still triggers the
		// write.
		const stored = parsedBook as unknown as Record<string, unknown>
		const incoming = { ...parsedBook, title: 'New Title', genres: [] }
		// The empty `genres` carries no evidence (omitted from the $set);
		// the ratings block rides as a `$mergeObjects` merge.
		const { genres: _noEvidenceGenres, ...incomingWithoutGenres } = incoming
		void _noEvidenceGenres
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(bookWithoutProjection) // raw row read (projection + _id)
			.mockResolvedValueOnce(bookWithoutProjection) // fresh read in update() (raw, _id for createdAt)
			.mockResolvedValue(stored as unknown as BookDocument) // post-update read
		helper.setData(incoming as typeof parsedBook)
		const result = await helper.createOrUpdate()
		expect(result.modified).toBe(true)
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin, $or: [{ region: { $exists: false } }, { region: options.region }] },
			expectedRatingsPipeline(incomingWithoutGenres)
		)
		const update = mockUpdateOne.mock.calls[0][1] as { $set: Record<string, unknown> }[]
		expect(update[0].$set).not.toHaveProperty('genres')
		// The stored genres survive the write (post-update read).
		expect(result.data?.genres).toEqual(parsedBook.genres)
	})

	test('update keeps a concurrent refresh: stale T0 snapshot does not restore', async () => {
		// Interleaving: createOrUpdate reads T0 (no tags), a concurrent
		// refresh commits T1 (adds tags) before update() runs. The write
		// must be built against the fresh T1 read, so T1's tags survive
		// and only the incoming title changes.
		const newTags = [{ tagId: 't2', name: 'Feel-Good', type: 'mood' as const }]
		const t1 = {
			...parsedBook,
			title: 'Changed Title',
			tags: newTags
		} as unknown as Record<string, unknown>
		const incoming = { ...parsedBook, title: 'Changed Title' }
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(bookWithoutProjection) // raw row read (projection + _id)
			.mockResolvedValueOnce({ ...bookWithoutProjection, tags: newTags }) // T1 read in update()
			.mockResolvedValue(t1 as unknown as BookDocument) // post-update read
		helper.setData(incoming as typeof parsedBook)
		const result = await helper.createOrUpdate()
		expect(result.modified).toBe(true)
		expect(result.data?.tags).toEqual(newTags)
		// Evidence-only write: the incoming book's own values ride as
		// `$literal` values (title change and every other incoming field);
		// T1's tags are not restored from the stale snapshot — they survive
		// untouched.
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin, $or: [{ region: { $exists: false } }, { region: options.region }] },
			expectedRatingsPipeline(incoming)
		)
	})
	test('createOrUpdate with stored empty genres is a no-op update', async () => {
		// A stored `genres: []` is a real key the database retains, so the
		// effective write must keep it: the write equals the stored row and
		// createOrUpdate short-circuits. If the projection dropped the key,
		// the deep comparison below fails and an update is issued.
		const sortedJson = (value: unknown): string =>
			JSON.stringify(value, Object.keys(value as object).sort())
		// The raw row carries `_id`: the equal path's conditional
		// marker-unset targets the compared row by it.
		const stored = {
			...bookWithoutProjection,
			genres: []
		} as unknown as Record<string, unknown>
		const incoming = { ...parsedBook, genres: [] }
		mockIsEqualData.mockImplementation((a: unknown, b: unknown) => sortedJson(a) === sortedJson(b))
		mockFindOne.mockResolvedValue(stored as unknown as BookDocument)
		helper.setData(incoming as typeof parsedBook)
		const result = await helper.createOrUpdate()
		expect(result.modified).toBe(false)
		// The equal path issues exactly one read (the raw row); the
		// short-circuit never proceeds to an update read.
		expect(mockFindOne).toHaveBeenCalledTimes(1)
		// The equal fast path only issues the conditional ratingsBackfillSkip
		// $unset (a no-op write when no marker exists) — no $set, no $currentDate.
		expect(mockUpdateOne).toHaveBeenCalledTimes(1)
		const update = mockUpdateOne.mock.calls[0][1] as Record<string, unknown>
		expect(update).not.toHaveProperty('$set')
		expect(update).not.toHaveProperty('$currentDate')
		expect(update.$unset).toEqual({ ratingsBackfillSkip: '' })
	})
})

describe('PaprAudibleBookHelper should catch error when', () => {
	test('create', async () => {
		mockInsertOne.mockRejectedValue(new Error('error'))
		helper.setData(parsedBook)
		await expect(helper.create()).rejects.toThrow(
			`An error occurred while creating book ${asin} in the DB`
		)
	})
	test('delete', async () => {
		mockDeleteOne.mockRejectedValue(new Error('error'))
		await expect(helper.delete()).rejects.toThrow(
			`An error occurred while deleting book ${asin} in the DB`
		)
	})
	test('update did not find existing', async () => {
		mockFindOne.mockResolvedValueOnce(null)
		helper.setData(parsedBook)
		await expect(helper.update()).rejects.toThrow(
			`An error occurred while updating book ${asin} in the DB`
		)
	})
	test('update', async () => {
		mockUpdateOne.mockRejectedValue(new Error('error'))
		helper.setData(parsedBook)
		await expect(helper.update()).rejects.toThrow(
			`An error occurred while updating book ${asin} in the DB`
		)
	})
})

describe('PaprAudibleBookHelper should log error when', () => {
	test('create logs error on BookModel.insertOne failure', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleBookHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)
		helperWithLogger.setData(parsedBook)
		mockInsertOne.mockRejectedValue(new Error('DB error'))
		await expect(helperWithLogger.create()).rejects.toThrow(
			`An error occurred while creating book ${asin} in the DB`
		)
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})

	test('delete logs error on BookModel.deleteOne failure', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleBookHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)
		mockDeleteOne.mockRejectedValue(new Error('DB error'))
		await expect(helperWithLogger.delete()).rejects.toThrow(
			`An error occurred while deleting book ${asin} in the DB`
		)
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})

	test('update logs error when BookModel.findOne returns null (not found)', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleBookHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)
		helperWithLogger.setData(parsedBook)
		mockFindOne.mockResolvedValueOnce(null)
		await expect(helperWithLogger.update()).rejects.toThrow(
			`An error occurred while updating book ${asin} in the DB`
		)
		expect(mockLogger.error).toHaveBeenCalledWith(`Book ${asin} not found in the DB for update`)
	})

	test('update logs error on BookModel.updateOne failure', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleBookHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)
		helperWithLogger.setData(parsedBook)
		mockFindOne.mockResolvedValueOnce(bookWithoutProjection)
		mockUpdateOne.mockRejectedValue(new Error('DB error'))
		await expect(helperWithLogger.update()).rejects.toThrow(
			`An error occurred while updating book ${asin} in the DB`
		)
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})
})

describe('PaprAudibleBookHelper should log info when', () => {
	test('createOrUpdate logs NoticeUpdateAsin when update=1, data differs, and genres non-empty', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleBookHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)

		mockIsEqualData.mockReturnValue(false)

		mockFindOne
			.mockResolvedValueOnce(parsedBook as unknown as BookDocument)
			.mockResolvedValueOnce(bookWithoutProjection)
			.mockResolvedValue(parsedBook as unknown as BookDocument)

		helperWithLogger.setData(parsedBook)

		const result = await helperWithLogger.createOrUpdate()

		expect(mockLogger.info).toHaveBeenCalledWith(`Updating book ASIN ${asin}`)
		expect(result.modified).toBe(true)
	})
})

afterAll(() => {
	mock.restore()
})
