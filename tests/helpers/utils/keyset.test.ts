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

// Simulate an `_id $gt`-paginated collection with batchSize 2: the page
// starts at the index after the $gt boundary id (or 0 on the first page).
const findPaged = (batchSize: number) => async (filter: object) => {
	// Offset after the $gt boundary id (or 0 on the first page).
	const offset = filter._id
		? ids.findIndex((id) => id.equals((filter._id as { $gt: ObjectId }).$gt)) + 1
		: 0
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
		expect(find).toHaveBeenNthCalledWith(1, { ratings: { $exists: false } }, findOptions)
		expect(find).toHaveBeenNthCalledWith(
			2,
			{ ratings: { $exists: false }, _id: { $gt: ids[1] } },
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
	const staleDocs = [s1, s2, s3, s4]

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
	})

	it('advances by _id across equal updatedAt (no infinite loop)', async () => {
		const find = mock().mockImplementation(findStalePaged)
		const onBatch = mock()
		const batches = await iterateStaleKeyset(find, options, onBatch)
		expect(batches).toBe(2)
		expect(onBatch).toHaveBeenCalledTimes(2)
		expect(onBatch.mock.calls[0][0]).toEqual([s1, s2])
		expect(onBatch.mock.calls[1][0]).toEqual([s3, s4])
		expect(find).toHaveBeenCalledTimes(3)
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
