import type { ObjectId } from 'mongodb'

export interface KeysetOptions<P extends Record<string, 1>> {
	/** Extra filter ANDed with the `_id $gt` continuation, e.g. `{ ratings: { $exists: false } }`. */
	baseFilter?: object
	batchSize: number
	projection: P
}

/**
 * Walk a collection in `_id`-keyset batches (sort `{ _id: 1 }`) with a bounded
 * `limit`, invoking `onBatch` per non-empty batch. Memory stays at one batch
 * regardless of collection size (papr's find() drains whole cursors into
 * arrays). Returns the number of batches visited. `onBatch` returning `false`
 * stops the walk early.
 */
export async function iterateKeyset<T extends { _id: ObjectId }, P extends Record<string, 1>>(
	find: (
		filter: object,
		options: { projection: P; sort: { _id: 1 }; limit: number }
	) => Promise<T[]>,
	options: KeysetOptions<P>,
	onBatch: (batch: T[]) => Promise<boolean | void>
): Promise<number> {
	const { baseFilter = {}, batchSize, projection } = options
	let lastId: ObjectId | null = null
	let batches = 0
	while (true) {
		const filter = lastId ? { ...baseFilter, _id: { $gt: lastId } } : { ...baseFilter }
		const batch = await find(filter, { projection, sort: { _id: 1 }, limit: batchSize })
		if (batch.length === 0) break
		batches += 1
		const stop = await onBatch(batch)
		if (stop === false) break
		lastId = batch[batch.length - 1]._id
	}
	return batches
}
