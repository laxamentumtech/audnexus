import type { ObjectId } from 'mongodb'

/** Standard projection for keyset walks over the asin+region models. */
export const ASIN_REGION_PROJECTION: { asin: 1; region: 1 } = { asin: 1, region: 1 }

/** Document shape for keyset walks over the asin+region models. */
export interface DocumentWithRegion {
	_id: ObjectId
	asin: string
	region?: string | null
}

/**
 * Shared find() adapter for keyset walks over the asin+region models.
 * Adapts a papr model's find() to the `iterateKeyset` callback contract
 * (projection `{ asin: 1, region: 1 }`, `_id`-sorted, bounded `limit`); the
 * `as never` casts bypass papr generics that TS cannot resolve for keyset
 * continuation filters.
 */
export function keysetFindAdapter(model: {
	find: (filter: object, options: object) => Promise<DocumentWithRegion[]>
}): (
	filter: object,
	options: { projection: { asin: 1; region: 1 }; sort: { _id: 1 }; limit: number }
) => Promise<DocumentWithRegion[]> {
	return (filter, options) => model.find(filter as never, options as never)
}

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
