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
	const { baseFilter, batchSize, projection } = options
	let lastId: ObjectId | null = null
	let batches = 0
	while (true) {
		const continuation = lastId ? { _id: { $gt: lastId } } : {}
		// The base filter is `$and`-composed with the continuation so a
		// baseFilter carrying its own `_id` bound (explicit upper watermark)
		// is never overwritten by the walk's own continuation.
		const filter =
			baseFilter === undefined
				? continuation
				: { $and: [baseFilter, ...(Object.keys(continuation).length ? [continuation] : [])] }
		const batch = await find(filter, { projection, sort: { _id: 1 }, limit: batchSize })
		if (batch.length === 0) break
		batches += 1
		const stop = await onBatch(batch)
		if (stop === false) break
		lastId = batch[batch.length - 1]._id
	}
	return batches
}

/** Document shape for `updatedAt`-ordered (staleness) walks. */
export interface StaleDocumentWithRegion {
	_id: ObjectId
	asin: string
	region?: string | null
	updatedAt?: Date
}

/** Projection for staleness walks — `updatedAt` is required: the walk continues
 * on the compound (updatedAt, _id) key. */
export const ASIN_REGION_UPDATED_PROJECTION: { asin: 1; region: 1; updatedAt: 1 } = {
	asin: 1,
	region: 1,
	updatedAt: 1
}

export interface StaleKeysetOptions<P extends Record<string, 1>> {
	baseFilter?: object
	batchSize: number
	projection: P
	/** Exclusive upper bound: only documents with updatedAt <= staleBefore are visited. */
	staleBefore: Date
}

/**
 * Shared find() adapter for staleness walks. Adapts a papr model's find() to
 * the `iterateStaleKeyset` callback contract (projection including `updatedAt`,
 * `{ updatedAt: 1, _id: 1 }`-sorted, bounded `limit`); the `as never` casts
 * bypass papr generics, same as `keysetFindAdapter`.
 */
export function staleKeysetFindAdapter(model: {
	find: (filter: object, options: object) => Promise<StaleDocumentWithRegion[]>
}): (
	filter: object,
	options: {
		projection: { asin: 1; region: 1; updatedAt: 1 }
		sort: { updatedAt: 1; _id: 1 }
		limit: number
	}
) => Promise<StaleDocumentWithRegion[]> {
	return (filter, options) => model.find(filter as never, options as never)
}

/**
 * Walk a collection in `{ updatedAt: 1, _id: 1 }`-keyset batches, visiting only
 * documents with `updatedAt <= staleBefore` (the staleness window). Continues
 * on the compound (updatedAt, _id) cursor so equal-`updatedAt` pages advance
 * by `_id` (no infinite loop). Memory stays at one batch regardless of
 * collection size. Returns the number of batches visited. `onBatch` returning
 * `false` stops the walk early.
 *
 * Docs with no `updatedAt` field never match `$lte` and are therefore never
 * visited — that is intended.
 */
export async function iterateStaleKeyset<
	T extends StaleDocumentWithRegion,
	P extends Record<string, 1>
>(
	find: (
		filter: object,
		options: { projection: P; sort: { updatedAt: 1; _id: 1 }; limit: number }
	) => Promise<T[]>,
	options: StaleKeysetOptions<P>,
	onBatch: (batch: T[]) => Promise<boolean | void>
): Promise<number> {
	const { baseFilter = {}, batchSize, projection, staleBefore } = options
	let cursor: { updatedAt: Date; _id: ObjectId } | null = null
	let batches = 0
	while (true) {
		const filter: Record<string, unknown> = { ...baseFilter, updatedAt: { $lte: staleBefore } }
		if (cursor) {
			filter.$or = [
				{ updatedAt: { $gt: cursor.updatedAt } },
				{ updatedAt: cursor.updatedAt, _id: { $gt: cursor._id } }
			]
		}
		const batch = await find(filter, {
			projection,
			sort: { updatedAt: 1, _id: 1 },
			limit: batchSize
		})
		if (batch.length === 0) break
		batches += 1
		const stop = await onBatch(batch)
		if (stop === false) break
		const last = batch[batch.length - 1]
		// The $lte filter guarantees a Date here; a missing value would loop
		// forever on the same page, so treat it as the end of the walk.
		if (!(last.updatedAt instanceof Date)) break
		cursor = { updatedAt: last.updatedAt, _id: last._id }
	}
	return batches
}
