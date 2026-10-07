import { describe, expect, it, mock } from 'bun:test'
import { ObjectId } from 'mongodb'

import { iterateKeyset } from '#helpers/utils/keyset'

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
const findPaged =
	(batchSize: number) =>
	async (filter: object) => {
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
		expect(find).toHaveBeenNthCalledWith(2, { ratings: { $exists: false }, _id: { $gt: ids[1] } }, findOptions)
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
