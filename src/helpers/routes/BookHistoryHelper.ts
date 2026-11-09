// Read-only history and artwork routes' data layer. These routes are
// operational instrumentation: unauthed like the rest of the API, no table
// or view, read-only, and served from retained stored data even when the
// current book is deleted and (in disabled mode) recording never ran.
//
// Existence rule for the list endpoints: an established history state (the
// retained resource, including after current-book deletion) OR a unique
// trusted exact-region current book. A trusted current book without state
// is a pending resource: list 200 with empty items and pending tracking.
// 409 surfaces an unresolved identity conflict; 404 is only for resources
// that are wholly unknown in the exact asin+region scope. Every query issues
// database reads only: no state initialization, legacy import, cache
// operation, or upstream request.

import type { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'

import type {
	ArtworkChange,
	EditorialHistoryField,
	HistoryField,
	HistoryListQuery,
	HistoryValue
} from '#config/bookHistory'
import {
	ArtworkChangeSchema,
	bookKey,
	EDITORIAL_FIELD_NAMES,
	HistoryValueSchema,
	isBookHistoryEnabled
} from '#config/bookHistory'
import BookModel from '#config/models/Book'
import type { BookArtworkDocument, BookHistoryStateDocument } from '#config/models/BookHistory'
import type { BookHistoryRevisionDocument } from '#config/models/BookHistory'
import {
	BookArtworkModel,
	BookHistoryRevisionModel,
	BookHistoryStateModel
} from '#config/models/BookHistory'
import {
	decodeArtworkCursor,
	decodeCursor,
	encodeArtworkCursor,
	encodeCursor
} from '#helpers/books/historyCursor'
import { ConflictError, NotFoundError } from '#helpers/errors/ApiErrors'
import { regions } from '#static/regions'

const supportedRegionSet = new Set(Object.keys(regions))

/** One public field delta inside a revision detail. */
export interface HistoryChangeField {
	before: HistoryValue
	after: HistoryValue
}

/** Public artwork transition inside a revision detail. Every recorded
 * transition has a non-null `before`: a first observation initializes
 * baselines silently and produces no revision entry. */
export interface HistoryChangeArtwork {
	rendition: string
	before: { imageId: string; sourceUrl: string }
	after: { imageId: string; sourceUrl: string }
}

/** One line in the history list: a revision identity and changed names. */
export interface HistoryListItem {
	revision: string
	observedAt: string
	changedFields: HistoryField[]
}

/**
 * The complete stored delta for one revision (public shape): optional
 * editorial-name keys, each a before/after value envelope, plus an optional
 * `artwork` array of changed comparable renditions.
 */
export interface HistoryDetailItem {
	[key: string]: HistoryChangeField | HistoryChangeArtwork[] | undefined
}

/** Per-field editorial coverage in the tracking block. */
export interface TrackingFieldEntry {
	policy: string | null
	baselineAt: string | null
}

/** The tracking block for a list response. */
export interface HistoryTracking {
	status: 'pending' | 'active'
	recordingEnabled: boolean
	startedAt: string | null
	fields: Record<EditorialHistoryField, TrackingFieldEntry>
	artwork: Record<string, { policy: string; baselineAt: string }>
}

/** One artwork gallery entry. */
export interface HistoricalArtworkEntry {
	assetId: string
	imageId: string | null
	legacy: {
		storedUrl: string
		importedAt: string
		observedAt: null
		rendition: null
	} | null
	renditions: Array<{
		rendition: string
		firstSourceUrl: string
		sourceUrl: string
		firstObservedAt: string
		observedAt: string
	}>
}

/** The revision shape as persisted by the writer (camelCase). */
interface RevisionShape {
	revision: number
	observedAt: Date
	changedFields: HistoryField[]
	policies: { fields: Record<string, string>; artwork: Record<string, string> }
	changes: Record<string, { before: HistoryValue; after: HistoryValue } | ArtworkChange[]>
}

function toIso(value: Date): string {
	return value.toISOString()
}

interface CurrentResolution {
	/** Establishment outcome for reading: the resource exists. */
	exists: boolean
	/** An unresolved identity conflict blocks the read (409). */
	conflict: boolean
}

/**
 * Resolve the read-time resource for the exact asin+region pair: an
 * established retained state wins; otherwise a unique trusted exact-region
 * current book makes the resource pending. Mirrors the writer's identity
 * rules without performing any write.
 */
async function resolveReadableResource(
	asin: string,
	region: string
): Promise<{ state: BookHistoryStateDocument | null; outcome: CurrentResolution }> {
	const state = (await BookHistoryStateModel.findOne({
		_id: bookKey(asin, region)
	} as never)) as unknown as BookHistoryStateDocument | null
	if (state && state.established) {
		return { state, outcome: { exists: true, conflict: false } }
	}
	// No established state: fall through to current-book resolution. The
	// writer's trusted rule is exactly one exact-region row with no
	// region-less/unsupported competitor; every other populated outcome
	// (duplicate exact rows, or any exact row with a competitor) is the
	// writer's 409 state and reads as a conflict too.
	const rows = (await BookModel.find(
		{
			asin,
			$or: [{ region }, { region: { $nin: Array.from(supportedRegionSet) } }]
		} as never,
		{ projection: { region: 1 } }
	)) as unknown as Array<{ region?: string | null }>
	const exact = rows.filter((row) => row.region === region)
	const competitors = rows.length - exact.length
	if (exact.length === 1 && competitors === 0) {
		return { state, outcome: { exists: true, conflict: false } }
	}
	if (exact.length > 1 || competitors > 0) {
		return { state, outcome: { exists: false, conflict: true } }
	}
	return { state, outcome: { exists: false, conflict: false } }
}

export default class BookHistoryHelper {
	asin: string
	logger?: FastifyBaseLogger

	constructor(asin: string, logger?: FastifyBaseLogger) {
		this.asin = asin
		this.logger = logger
	}

	/**
	 * `GET /books/:asin/history` — newest-first page of revisions.
	 * `field` selects complete matching revisions in the database query
	 * (the cursor binds the same field, so pages contain only matching
	 * revisions and the continuation advances over matching rows). 200 for
	 * an established resource (retained, including after deletion) and for
	 * a pending trusted current book; 409 for unresolved identity; 404
	 * otherwise.
	 */
	async listHistory(query: HistoryListQuery): Promise<{
		asin: string
		region: string
		tracking: HistoryTracking
		items: HistoryListItem[]
		nextCursor: string | null
	}> {
		const { region, limit, cursor, field } = query
		const { tracking, items, nextCursor } = await this.runList({
			region,
			limit,
			defaultUpper: (state) => state?.revision ?? 0,
			decode: () => decodeCursor(cursor, this.asin, region, field ?? null),
			buildFilter: (upper, before) => ({
				asin: this.asin,
				region,
				// The field condition runs in the query (backed by the
				// `history_field` index), not in memory: a rarely-changed field
				// must not force clients to page through every unrelated
				// revision to reach a matching one.
				...(field ? { changedFields: field } : {}),
				revision: { $lte: upper, $lt: before }
			}),
			sort: { revision: -1 },
			find: (filter, findOptions) =>
				BookHistoryRevisionModel.find(filter, findOptions) as Promise<RevisionShape[]>,
			watermarkOf: (doc) => doc.revision,
			mapItem: (doc) => ({
				revision: String(doc.revision),
				observedAt: toIso(doc.observedAt),
				changedFields: [...doc.changedFields]
			}),
			encodeNext: (upper, lastWatermark) =>
				encodeCursor(this.asin, region, field ?? null, upper, lastWatermark)
		})
		// The query only sees matching rows, so the window's last row is the
		// latest matching revision not yet returned: the continuation
		// advances over matching rows.
		return { asin: this.asin, region, tracking, items, nextCursor }
	}

	/**
	 * `GET /books/:asin/history/:revision` — one revision's full stored
	 * delta. An unavailable or cross-book revision always returns 404, even
	 * on a pending resource.
	 */
	async getRevision(
		region: string,
		revisionNumber: number
	): Promise<{
		asin: string
		region: string
		revision: number
		observedAt: string
		changedFields: HistoryField[]
		policies: { fields: Record<string, string>; artwork: Record<string, string> }
		changes: HistoryDetailItem
	}> {
		const { outcome } = await resolveReadableResource(this.asin, region)
		if (outcome.conflict || !outcome.exists) {
			throw new NotFoundError(`No history for book ${this.asin} in region ${region}`)
		}
		const doc = (await BookHistoryRevisionModel.findOne({
			asin: this.asin,
			region,
			revision: revisionNumber
		} as never)) as unknown as BookHistoryRevisionDocument
		if (!doc)
			throw new NotFoundError(`History revision ${revisionNumber} not found for book ${this.asin}`)
		return toHistoryDetail(this.asin, region, doc as unknown as RevisionShape)
	}

	/**
	 * `GET /books/:asin/artwork` — the retained artwork gallery, newest
	 * immutable sequence first. 200 for a pending resource (empty items);
	 * 409 for unresolved identity; 404 otherwise.
	 */
	async listArtwork(query: { region: string; limit: number; cursor?: string }): Promise<{
		asin: string
		region: string
		tracking: HistoryTracking
		items: HistoricalArtworkEntry[]
		nextCursor: string | null
	}> {
		const { region, limit, cursor } = query
		const { tracking, items, nextCursor } = await this.runList({
			region,
			limit,
			defaultUpper: (state) => state?.assetSequence ?? 0,
			decode: () => decodeArtworkCursor(cursor, this.asin, region),
			buildFilter: (upper, before) => ({
				asin: this.asin,
				region,
				sequence: { $lte: upper, $lt: before }
			}),
			sort: { sequence: -1 },
			find: (filter, findOptions) =>
				BookArtworkModel.find(filter, findOptions) as Promise<BookArtworkDocument[]>,
			watermarkOf: (doc) => doc.sequence,
			mapItem: toArtworkEntry,
			encodeNext: (upper, lastWatermark) =>
				encodeArtworkCursor(this.asin, region, upper, lastWatermark)
		})
		return { asin: this.asin, region, tracking, items, nextCursor }
	}

	/**
	 * Shared keyset pager for the two list endpoints: existence/identity
	 * check, cursor decode, `upper`/`before` windowing, `limit + 1` fetch,
	 * item mapping, and next-cursor encoding. Each caller supplies only the
	 * collection-specific parts so the two pages cannot drift apart.
	 */
	private async runList<TDoc, TItem>(params: {
		region: string
		limit: number
		defaultUpper: (state: BookHistoryStateDocument | null) => number
		decode: () => { upper: number; before: number } | null
		buildFilter: (upper: number, before: number) => Record<string, unknown>
		sort: Record<string, 1 | -1>
		find: (
			filter: Record<string, unknown>,
			options: { sort: Record<string, 1 | -1>; limit: number }
		) => Promise<TDoc[]>
		watermarkOf: (doc: TDoc) => number
		mapItem: (doc: TDoc) => TItem
		encodeNext: (upper: number, lastWatermark: number) => string
	}): Promise<{ tracking: HistoryTracking; items: TItem[]; nextCursor: string | null }> {
		const { state, outcome } = await resolveReadableResource(this.asin, params.region)
		if (outcome.conflict) {
			throw new ConflictError(`Book history identity conflict for ${this.asin}`, {
				asin: this.asin
			})
		}
		if (!outcome.exists) {
			throw new NotFoundError(`No history for book ${this.asin} in region ${params.region}`)
		}
		const decoded = params.decode()
		// `upper` is the listing's initial state watermark, captured when the
		// first page started (0 for a pending resource); it is retained across
		// pages from the cursor so a growing collection cannot skip rows.
		const upper = decoded?.upper ?? params.defaultUpper(state)
		const before = decoded?.before ?? Number.MAX_SAFE_INTEGER
		const docs = await params.find(params.buildFilter(upper, before), {
			sort: params.sort,
			limit: params.limit + 1
		})
		const hasMore = docs.length > params.limit
		const window = docs.slice(0, params.limit)
		const items = window.map(params.mapItem)
		const nextCursor =
			hasMore && window.length > 0
				? params.encodeNext(upper, params.watermarkOf(window[window.length - 1]))
				: null
		return { tracking: buildTracking(state), items, nextCursor }
	}
}

function toHistoryDetail(
	asin: string,
	region: string,
	shaped: RevisionShape
): {
	asin: string
	region: string
	revision: number
	observedAt: string
	changedFields: HistoryField[]
	policies: { fields: Record<string, string>; artwork: Record<string, string> }
	changes: HistoryDetailItem
} {
	// The stored `changes` map is a loose leaf in the papr schema, so the
	// read boundary validates it with the shared Zod schemas: a malformed
	// envelope is a server fault (500), never a silent API payload.
	const changes: HistoryDetailItem = {}
	const artwork: HistoryChangeArtwork[] = []
	for (const [rawField, change] of Object.entries(shaped.changes)) {
		if (rawField === 'artwork') {
			artwork.push(
				...z
					.array(ArtworkChangeSchema)
					.parse(change)
					.map((entry) => ({
						rendition: entry.rendition,
						before: entry.before,
						after: entry.after
					}))
			)
			continue
		}
		const fieldChange = z
			.object({ before: HistoryValueSchema, after: HistoryValueSchema })
			.parse(change)
		changes[rawField] = { before: fieldChange.before, after: fieldChange.after }
	}
	const detail = changes as HistoryDetailItem
	if (artwork.length) detail.artwork = artwork
	return {
		asin,
		region,
		revision: shaped.revision,
		observedAt: toIso(shaped.observedAt),
		changedFields: [...shaped.changedFields],
		policies: shaped.policies,
		changes: detail
	}
}

/**
 * Build the tracking block. `active` requires at least one comparable live
 * baseline (a field or rendition baseline initialized from an accepted
 * source observation). Pending resources have null start, all-null field
 * coverage, and no artwork coverage entries. Callers pass it only after
 * their existence check resolved to an existing resource — a
 * missing-resource tracking block is unreachable, so the former
 * `resourceExists` guard (and its `BadRequestError` throw) is gone.
 */
function buildTracking(state: BookHistoryStateDocument | null): HistoryTracking {
	const fields = {} as Record<EditorialHistoryField, TrackingFieldEntry>
	for (const name of EDITORIAL_FIELD_NAMES) {
		fields[name] = { policy: null, baselineAt: null }
	}
	let active = false
	let startedAt: string | null = null
	const artwork: Record<string, { policy: string; baselineAt: string }> = {}
	if (state) {
		for (const entry of state.fields ?? []) {
			if (EDITORIAL_FIELD_NAMES.includes(entry.field as EditorialHistoryField)) {
				fields[entry.field as EditorialHistoryField] = {
					policy: entry.policy,
					baselineAt: toIso(entry.baselineAt)
				}
				active = true
			}
		}
		// Artwork coverage lists initialized comparable renditions only;
		// absence means unknown coverage, not deleted artwork.
		for (const entry of state.renditions ?? []) {
			artwork[entry.rendition] = { policy: entry.policy, baselineAt: toIso(entry.baselineAt) }
			active = true
		}
		if (state.established && state.startedAt) startedAt = toIso(state.startedAt)
	}
	return {
		status: active ? 'active' : 'pending',
		recordingEnabled: isBookHistoryEnabled(),
		startedAt,
		fields,
		artwork
	}
}

function toArtworkEntry(doc: BookArtworkDocument): HistoricalArtworkEntry {
	const rawRenditions = (Array.isArray(doc.renditions) ? doc.renditions : []) as unknown as Array<{
		rendition: string
		firstSourceUrl: string
		sourceUrl: string
		firstObservedAt: Date
		observedAt: Date
	}>
	return {
		assetId: String(doc._id),
		imageId: doc.imageId ?? null,
		legacy: doc.legacy
			? {
					storedUrl: doc.legacy.storedUrl,
					importedAt: toIso(doc.legacy.importedAt),
					observedAt: null,
					rendition: null
				}
			: null,
		renditions: rawRenditions.map((entry) => ({
			rendition: entry.rendition,
			firstSourceUrl: entry.firstSourceUrl,
			sourceUrl: entry.sourceUrl,
			firstObservedAt: toIso(entry.firstObservedAt),
			observedAt: toIso(entry.observedAt)
		}))
	}
}
