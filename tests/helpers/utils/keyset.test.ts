import { describe, expect, it, mock } from 'bun:test'
import { ObjectId } from 'mongodb'

import { iterateKeyset, iterateStaleKeyset } from '#helpers/utils/keyset'

const ids = [
	'5f0000000000000000000001',
	'5f0000000000000000000002',
	'5f0000000000000000000003',
	'5f0000000000000000000004',
	'5f0000000000000000000005',
	'5f0000000000000000000006'
].map((s) => new ObjectId(s))

const docs = ids.map((_id) => ({ _id, asin: `A${_id.toString()}`, region: 'us' as string | null }))

const projection = { asin: 1, region: 1 } as const
const findOptions = { projection: { asin: 1, region: 1 }, sort: { _id: 1 }, limit: 2 }

/** Resolve the walk's `_id $gt` boundary from a flat or `$and`-composed filter. */
function boundaryId(filter: object): ObjectId | null {
	const f = filter as Record<string, unknown>
	const direct = f._id as { $gt?: ObjectId } | undefined
	if (direct?.$gt) return direct.$gt
	const and = f.$and as Array<Record<string, unknown>> | undefined
	for (const clause of and ?? []) {
		const nested = clause._id as { $gt?: ObjectId } | undefined
		if (nested?.$gt) return nested.$gt
	}
	return null
}

// Simulate an `_id $gt`-paginated collection with batchSize 2: the page
// starts at the index after the $gt boundary id (or 0 on the first page).
const findPaged =
	(batchSize: number) =>
	async (filter: object) => {
		// Offset after the $gt boundary id (or 0 on the first page).
		const boundary = boundaryId(filter)
		const offset = boundary ? ids.findIndex((id) => id.equals(boundary)) + 1 : 0
		return docs.slice(offset, offset + batchSize)
	}

describe('iterateKeyset should', () => {
	it('walk all pages in _id-keyset order with bounded finds', async () => {
		const find = mock().mockImplementation(findPaged(2))
		const onBatch = mock()
		const batches = await iterateKeyset(find, { projection, batchSize: 2 }, onBatch)
		expect(batches).toBe(3)
		expect(onBatch).toHaveBeenCalledTimes(3)
		expect(onBatch.mock.calls[0][0]).toEqual(docs.slice(0, 2))
		expect(onBatch.mock.calls[1][0]).toEqual(docs.slice(2, 4))
		expect(onBatch.mock.calls[2][0]).toEqual(docs.slice(4, 6))
		expect(find).toHaveBeenNthCalledWith(1, {}, findOptions)
		expect(find).toHaveBeenNthCalledWith(2, { _id: { $gt: ids[1] } }, findOptions)
		expect(find).toHaveBeenNthCalledWith(3, { _id: { $gt: ids[3] } }, findOptions)
		expect(find).toHaveBeenCalledTimes(4)
	})

	it('ANDs the base filter with the _id continuation', async () => {
		const find = mock().mockImplementation(findPaged(2))
		await iterateKeyset(
			find,
			{ projection, baseFilter: { ratings: { $exists: false } }, batchSize: 2 },
			mock()
		)
		expect(find).toHaveBeenNthCalledWith(1, { $and: [{ ratings: { $exists: false } }] }, findOptions)
		expect(find).toHaveBeenNthCalledWith(
			2,
			{ $and: [{ ratings: { $exists: false } }, { _id: { $gt: ids[1] } }] },
			findOptions
		)
	})

	it('keeps a baseFilter with its own _id bound on every page', async () => {
		// Seed sends `{ $and: [{ _id: { $gt } }, { _id: { $lte } }] }`: the
		// upper watermark is part of the base filter, so the walk's `$gt`
		// continuation must be ANDed in without dropping the bound.
		const find = mock().mockImplementation(findPaged(2))
		await iterateKeyset(
			find,
			{ projection, baseFilter: { _id: { $lte: ids[4] } }, batchSize: 2 },
			mock()
		)
		// The first page carries the base bound with no continuation yet.
		expect(find).toHaveBeenNthCalledWith(1, { $and: [{ _id: { $lte: ids[4] } }] }, findOptions)
		// Each continuation ANDs the $gt onto the bound — never replaces it.
		expect(find).toHaveBeenNthCalledWith(
			2,
			{ $and: [{ _id: { $lte: ids[4] } }, { _id: { $gt: ids[1] } }] },
			findOptions
		)
		expect(find).toHaveBeenNthCalledWith(
			3,
			{ $and: [{ _id: { $lte: ids[4] } }, { _id: { $gt: ids[3] } }] },
			findOptions
		)
	})

	it('returns zero batches when the first page is empty', async () => {
		const find = mock().mockResolvedValueOnce([])
		const onBatch = mock()
		const batches = await iterateKeyset(find, { projection, batchSize: 2 }, onBatch)
		expect(batches).toBe(0)
		expect(onBatch).not.toHaveBeenCalled()
		expect(find).toHaveBeenCalledTimes(1)
	})

	it('stops when onBatch returns false', async () => {
		const find = mock().mockImplementation(findPaged(2))
		const onBatch = mock().mockResolvedValueOnce(false)
		const batches = await iterateKeyset(find, { projection, batchSize: 2 }, onBatch)
		expect(batches).toBe(1)
		expect(onBatch).toHaveBeenCalledTimes(1)
		expect(find).toHaveBeenCalledTimes(1)
	})
})

describe('iterateStaleKeyset should', () => {
	const staleProjection = { asin: 1, region: 1, updatedAt: 1 } as const
	const staleBefore = new Date('2026-01-01T00:00:00.000Z')
	const options = { projection: staleProjection, batchSize: 2, staleBefore }

	// Staleness-ordered docs: ascending updatedAt, with two sharing the same
	// updatedAt to prove the (updatedAt, _id) compound cursor advances by _id.
	const s1 = { _id: ids[0], asin: 'S1', region: 'us', updatedAt: new Date('2020-01-01T00:00:00Z') }
	const s2 = { _id: ids[1], asin: 'S2', region: 'us', updatedAt: new Date('2020-01-02T00:00:00Z') }
	const s3 = { _id: ids[2], asin: 'S3', region: 'us', updatedAt: new Date('2020-01-02T00:00:00Z') }
	const s4 = { _id: ids[3], asin: 'S4', region: 'us', updatedAt: new Date('2020-01-03T00:00:00Z') }
	const s5 = { _id: ids[4], asin: 'S5', region: 'us', updatedAt: new Date('2020-01-04T00:00:00Z') }
	const staleDocs = [s1, s2, s3, s4, s5]

	// Page over the (updatedAt, _id) compound key for batchSize 2: the first
	// page has no cursor; later pages carry the $or continuation from the last
	// doc of the previous page.
	const findStalePaged = async (filter: object) => {
		const or = (
			filter as {
				$or?: Array<{ updatedAt: { $gt: Date } } | { updatedAt: Date; _id: { $gt: ObjectId } }>
			}
		).$or
		if (!or) return staleDocs.slice(0, 2)
		// or[1]._id is `{ $gt: <id> }` (the compound continuation), not the bare id.
		const after = or[1]._id.$gt
		const index = staleDocs.findIndex((d) => d._id.equals(after)) + 1
		return staleDocs.slice(index, index + 2)
	}

	it('uses the updatedAt filter and the (updatedAt, _id) sort on the first page', async () => {
		const find = mock().mockImplementation(findStalePaged)
		await iterateStaleKeyset(find, options, mock())
		expect(find).toHaveBeenNthCalledWith(
			1,
			{ updatedAt: { $lte: staleBefore } },
			{
				projection: staleProjection,
				sort: { updatedAt: 1, _id: 1 },
				limit: 2
			}
		)
	})

	it('continues with the compound (updatedAt, _id) $or on later pages', async () => {
		const find = mock().mockImplementation(findStalePaged)
		await iterateStaleKeyset(find, options, mock())
		expect(find).toHaveBeenNthCalledWith(
			2,
			{
				updatedAt: { $lte: staleBefore },
				$or: [
					{ updatedAt: { $gt: s2.updatedAt } },
					{ updatedAt: s2.updatedAt, _id: { $gt: s2._id } }
				]
			},
			{ projection: staleProjection, sort: { updatedAt: 1, _id: 1 }, limit: 2 }
		)
		// The third page keeps the clause ordering: the strict updatedAt
		// comparison first, the compound (updatedAt, _id) tiebreak second.
		expect(find).toHaveBeenNthCalledWith(
			3,
			{
				updatedAt: { $lte: staleBefore },
				$or: [
					{ updatedAt: { $gt: s4.updatedAt } },
					{ updatedAt: s4.updatedAt, _id: { $gt: s4._id } }
				]
			},
			{ projection: staleProjection, sort: { updatedAt: 1, _id: 1 }, limit: 2 }
		)
	})

	it('advances by _id across equal updatedAt (no infinite loop)', async () => {
		const find = mock().mockImplementation(findStalePaged)
		const onBatch = mock()
		const batches = await iterateStaleKeyset(find, options, onBatch)
		expect(batches).toBe(3)
		expect(onBatch).toHaveBeenCalledTimes(3)
		expect(onBatch.mock.calls[0][0]).toEqual([s1, s2])
		expect(onBatch.mock.calls[1][0]).toEqual([s3, s4])
		expect(onBatch.mock.calls[2][0]).toEqual([s5])
		expect(find).toHaveBeenCalledTimes(4)
	})

	it('stops the walk when the last doc lacks a Date updatedAt', async () => {
		// The $lte filter should guarantee a Date, but a non-Date value
		// (e.g. a projection quirk) must end the walk, not loop forever on
		// the same page.
		const badDoc = { ...s1, updatedAt: 'not-a-date' }
		const find = mock().mockResolvedValueOnce([badDoc])
		const onBatch = mock()
		const batches = await iterateStaleKeyset(find, options, onBatch)
		expect(batches).toBe(1)
		expect(find).toHaveBeenCalledTimes(1)
	})

	it('stops when onBatch returns false', async () => {
		const find = mock().mockImplementation(findStalePaged)
		const onBatch = mock().mockResolvedValueOnce(false)
		const batches = await iterateStaleKeyset(find, options, onBatch)
		expect(batches).toBe(1)
		expect(find).toHaveBeenCalledTimes(1)
	})

	it('returns zero batches when the first page is empty', async () => {
		const find = mock().mockResolvedValueOnce([])
		const onBatch = mock()
		const batches = await iterateStaleKeyset(find, options, onBatch)
		expect(batches).toBe(0)
		expect(onBatch).not.toHaveBeenCalled()
		expect(find).toHaveBeenCalledTimes(1)
	})
})
