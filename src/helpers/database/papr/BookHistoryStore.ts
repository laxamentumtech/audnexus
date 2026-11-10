// Transactional writer for the book history feature. Every history-enabled
// current/state/revision/asset change uses one MongoClient session with
// `session.withTransaction` (snapshot read concern, majority write concern,
// primary reads) and ends the session in `finally`. No upstream requests,
// Redis operations, or logging side effects run inside a retryable callback;
// session operations await serially. Reads are recomputed on every callback
// retry, before-values included — upserts are keyed and idempotent.
//
// Trust levels: current-book identity requires exactly one exact-region row
// and no region-less/unsupported competing candidate. Ambiguity blocks
// refresh persistence and delete with a conflict; an established history
// state is still independently readable by the read-only routes.

import type { ClientSession, DeleteResult, Document, MongoClient } from 'mongodb'
import { ObjectId } from 'mongodb'
import { createHash, randomUUID } from 'node:crypto'

import type {
	BookObservation,
	FieldBaseline,
	HistoryBaselines,
	RenditionBaseline
} from '#config/bookHistory'
import {
	bookKey,
	HISTORY_INDEX_DEFINITIONS,
	HistoryValueSchema,
	isSupportedRegionValue,
	SEED_PROGRESS_ID,
	SUPPORTED_REGIONS
} from '#config/bookHistory'
import type { ApiBook } from '#config/types'
import { ApiBookSchema, asin10Regex } from '#config/types'
import { parseArtworkReference } from '#helpers/books/audible/BookObservation'
import type { ComparisonResult } from '#helpers/books/BookHistoryComparison'
import { compareBookObservation } from '#helpers/books/BookHistoryComparison'
import { ConflictError } from '#helpers/errors/ApiErrors'

const COLLECTIONS = {
	state: 'book_history_states',
	revision: 'book_history_revisions',
	artwork: 'book_artwork',
	seedProgress: 'book_history_seed_progress',
	identityException: 'book_history_identity_exceptions',
	books: 'books'
} as const

/** Hard cap on the per-key generation counter (a JS safe integer). */
const GENERATION_LIMIT = Number.MAX_SAFE_INTEGER

export type PersistDisposition = 'accepted' | 'rejected' | 'stale' | 'transient'

export interface PersistInput {
	asin: string
	region: string
	generation: number
	book: ApiBook
	observation: BookObservation
}

export interface PersistResult {
	data: ApiBook | null
	modified: boolean
	disposition: PersistDisposition
}

/** Raw document shapes as stored (not papr-stamped). The papr model's
 * document type (the Zod-decoded `BookHistoryStateDocument` /
 * `BookHistorySeedProgressDocument` in `#config/models/BookHistory`) is
 * AUTHORITATIVE: these interfaces mirror it for the store's raw read/write
 * boundary, and must be kept in sync when the papr schema changes. A full
 * compile-time link is not expressible (papr's document type carries
 * papr-internal stamped fields that are not part of the raw shape). */
interface SeedProgressDoc extends Document {
	_id: string
	runId: string
	completed: boolean
	startedAt: Date
	updatedAt: Date
	lastId?: ObjectId | null
	upperId?: ObjectId | null
}

interface StateDoc extends Document {
	_id: string
	asin: string
	region: string
	allocatedGeneration: number
	acceptedGeneration: number
	deleteFence: number
	revision: number
	assetSequence: number
	stateVersion: number
	established: boolean
	legacyCaptured: boolean
	startedAt?: Date | null
	fields?: FieldBaseline[]
	renditions?: RenditionBaseline[]
}

interface CurrentResolution {
	trustedBook: Document | null
	exactCount: number
	competitorCount: number
}

/** Sanitize an existing document into the validated public projection. */
function toApiBook(doc: Document | null | undefined): ApiBook | null {
	if (!doc) return null
	const parsed = ApiBookSchema.safeParse(doc)
	return parsed.success ? parsed.data : null
}

/** Pre-order: a freshly fetched releaseDate strictly in the future. */
function isPreOrderBook(book: ApiBook): boolean {
	return book.releaseDate > new Date()
}

/**
 * The existing update flow's genre safeguard, reproduced exactly
 * (`PaprAudibleBookHelper.createOrUpdate`): an unequal update is only
 * allowed when genre evidence exists — the stored genres are present, or
 * the stored genres are absent and the incoming genres are — and the
 * incoming genres are non-empty (no "nuked data" updates).
 */
function genreSafeguardPasses(oldDoc: Document, newBook: ApiBook): boolean {
	const oldHasGenres = Boolean(oldDoc.genres)
	const newHasGenres = Boolean(newBook.genres?.length)
	// Neither side carries genre evidence: there is nothing to protect from
	// being nuked. Rejecting here permanently froze legacy rows that never
	// had category ladders — every other field, including ratings, was
	// blocked along with the empty genre list (the `books` validator then
	// refuses partial repair writes, so the row could never converge).
	if (!oldHasGenres && !newHasGenres) return true
	// Stored genres may only be dropped by an update that supplies its own
	// genre evidence; storing genres and refreshing them stays allowed.
	return newHasGenres
}

/** Deep structural equality over the sanitized public projections. */
function deepEqualBook(a: ApiBook, b: ApiBook): boolean {
	const aObj = a as unknown as Record<string, unknown>
	const bObj = b as unknown as Record<string, unknown>
	const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)])
	for (const key of keys) {
		const av = aObj[key]
		const bv = bObj[key]
		if (av === bv) continue
		if (
			typeof av === 'object' ||
			typeof bv === 'object' ||
			Array.isArray(av) ||
			Array.isArray(bv)
		) {
			if (JSON.stringify(av) !== JSON.stringify(bv)) return false
		} else if (av !== bv) {
			return false
		}
	}
	return true
}

/** The series fields the store may $unset on an explicit removal. */
const SERIES_FIELDS: readonly string[] = ['seriesPrimary', 'seriesSecondary']

/** Equality for the update flow's equal short-circuit: series keys present
 * ONLY on the stored side are ignored when the incoming observation carries
 * no series evidence at all — neither a seriesPrimary/seriesSecondary key
 * on the book nor a series field in the observation. The write path retains
 * unknown-evidence series on the row (it never clears them without an
 * explicit removal observation), so such stored-only keys must not force an
 * unequal result and a redundant write with `modified: true` on every
 * accepted fetch. Any series evidence (including an explicit null value,
 * the producer's vanished-series signal) is compared as usual. */
function deepEqualBookIgnoringStoredOnlySeries(
	a: ApiBook,
	b: ApiBook,
	incomingHasSeriesEvidence: boolean
): boolean {
	if (incomingHasSeriesEvidence) return deepEqualBook(a, b)
	const aObj = a as unknown as Record<string, unknown>
	const bObj = b as unknown as Record<string, unknown>
	const storedHasSeriesOnly = SERIES_FIELDS.some((field) => field in aObj)
	if (!storedHasSeriesOnly) return deepEqualBook(a, b)
	return deepEqualBook(
		omitSeriesKeys(aObj) as unknown as ApiBook,
		omitSeriesKeys(bObj) as unknown as ApiBook
	)
}

function omitSeriesKeys(obj: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const key of Object.keys(obj)) {
		if (!SERIES_FIELDS.includes(key)) out[key] = obj[key]
	}
	return out
}

function sha256Hex(value: string): string {
	return createHash('sha256').update(value).digest('hex')
}

function emptyState(asin: string, region: string): StateDoc {
	return {
		_id: bookKey(asin, region),
		asin,
		region,
		allocatedGeneration: 0,
		acceptedGeneration: 0,
		deleteFence: 0,
		revision: 0,
		assetSequence: 0,
		stateVersion: 0,
		established: false,
		legacyCaptured: false,
		fields: [],
		renditions: []
	} as StateDoc
}

export class BookHistoryStore {
	private client: MongoClient | null = null

	configure(client: MongoClient): void {
		this.client = client
	}

	private requireClient(): MongoClient {
		const client = this.client
		if (!client) throw new Error('BookHistoryStore is not configured with a MongoClient')
		return client
	}

	private collection<T extends Document>(name: string) {
		return this.requireClient().db('audnexus').collection<T>(name)
	}

	/** Shared majority snapshot transaction wrapper. */
	private async withTx<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
		const session = await this.requireClient().startSession()
		try {
			return await session.withTransaction(fn, {
				readConcern: 'snapshot',
				writeConcern: { w: 'majority' },
				readPreference: 'primary'
			})
		} finally {
			await session.endSession()
		}
	}

	// ───────────────────────── identity resolution ─────────────────────────

	/**
	 * Resolve current-book identity inside the caller's transaction.
	 * Fully trusted: exactly one exact-region row and no region-less
	 * competitor; everything else is an unresolved outcome.
	 */
	private async resolveCurrent(
		session: ClientSession,
		asin: string,
		region: string
	): Promise<CurrentResolution> {
		// Non-exact competitors include region-less, null, and
		// non-supported-region rows — every row that is not the exact
		// region for this identity. Counts bound memory to O(1); the
		// trusted row itself is fetched (bounded to one) only when the
		// identity resolves to exactly one exact row and no competitor.
		const booksCol = this.collection<Document>(COLLECTIONS.books)
		const exactCount = await booksCol.countDocuments({ asin, region }, { session })
		const competitorCount = await booksCol.countDocuments(
			{ asin, region: { $nin: SUPPORTED_REGIONS } },
			{ session }
		)
		const trustedBook =
			exactCount === 1 && competitorCount === 0
				? ((
						(await booksCol
							.find({ asin, region }, { session })
							.sort({ _id: 1 })
							.limit(1)
							.toArray()) as Document[]
					)[0] ?? null)
				: null
		return { trustedBook, exactCount, competitorCount }
	}

	private conflictError(asin: string): never {
		throw new ConflictError(`Book history identity conflict for ${asin}`, {
			asin
		})
	}

	// ───────────────────────── shared legacy capture ─────────────────────────

	/**
	 * Archive a still-stored current image as a legacy gallery reference.
	 * Preserves the exact stored string, recognized ID or unparsed key, null
	 * upstream time, unknown rendition; the import time is separate. Never
	 * invents a first-observation date from the import time. Idempotent when
	 * the same stored string already exists. A non-ObjectId source row
	 * cannot satisfy the ObjectId-typed `legacy.sourceBookId`; the typed
	 * capture is skipped after the stored URL is retained as an identity
	 * exception, so a caller that deletes the row loses no image.
	 */
	async captureLegacy(
		session: ClientSession,
		asin: string,
		region: string,
		sourceBook: Document
	): Promise<number> {
		const storedUrl =
			typeof sourceBook.image === 'string' && sourceBook.image ? sourceBook.image : undefined
		if (!storedUrl) return 0
		if (!(sourceBook._id instanceof ObjectId)) {
			await this.recordIdentityException(session, sourceBook)
			return 0
		}
		const imageId = parseArtworkReference(storedUrl)
		const artwork = this.collection<Document>(COLLECTIONS.artwork)
		const legacy = {
			sourceBookId: sourceBook._id,
			storedUrl,
			importedAt: new Date()
		}
		const keyFilter = imageId !== null ? { imageId } : { unparsedKey: sha256Hex(storedUrl) }
		const existing = (
			await artwork
				.find({ asin, region, ...keyFilter } as Document, { session })
				.limit(1)
				.sort({ sequence: 1 })
				.toArray()
		)[0]
		if (existing) {
			// The unique `artwork_unparsed` index already guarantees the same
			// sha256 key per asin+region, and the stored URL lives under
			// `legacy.storedUrl`; a mismatched URL under the same hash is
			// recorded, not fatal.
			if (!existing.legacy) {
				await artwork.updateOne({ _id: existing._id }, { $set: { legacy } }, { session })
			}
			return 0
		}
		const state = (await this.collection<StateDoc>(COLLECTIONS.state).findOne(
			{ _id: bookKey(asin, region) },
			{ session }
		)) as StateDoc | null
		const sequence = (state?.assetSequence ?? 0) + 1
		const doc: Document = { asin, region, sequence, legacy, renditions: [] }
		if (imageId !== null) doc.imageId = imageId
		else doc.unparsedKey = sha256Hex(storedUrl)
		await artwork.insertOne(doc, { session })
		if (state) {
			await this.collection<StateDoc>(COLLECTIONS.state).updateOne(
				{ _id: state._id },
				{ $set: { assetSequence: sequence } },
				{ session }
			)
		}
		return sequence
	}

	/**
	 * Record a region-less (or unresolvable) current row as an identity
	 * exception, preserving the exact stored image string, region state,
	 * and the source book's own origin timestamp.
	 */
	async recordIdentityException(
		session: ClientSession,
		sourceBook: Document,
		opts?: { asinValid?: boolean }
	): Promise<void> {
		const asin = String(sourceBook.asin)
		const hasRegionKey = 'region' in sourceBook && sourceBook.region !== undefined
		const regionState: 'missing' | 'null' | 'value' = !hasRegionKey
			? 'missing'
			: sourceBook.region === null
				? 'null'
				: 'value'
		let region: { state: string; value?: string }
		if (regionState === 'value') {
			region = { state: regionState, value: String(sourceBook.region) }
		} else {
			region = { state: regionState }
		}
		const idValid = sourceBook._id instanceof ObjectId
		const reasons: string[] = []
		if (!idValid) reasons.push('unsupported_id')
		if (opts?.asinValid === false) reasons.push('invalid_asin')
		if (regionState === 'missing') reasons.push('missing_region')
		else if (regionState === 'null') reasons.push('invalid_region')
		else if (!isSupportedRegionValue(sourceBook.region)) reasons.push('invalid_region')
		if (reasons.length === 0) reasons.push('ambiguous_identity')
		// Non-ObjectId source rows (audit/seed: `unsupported_id`) cannot be the
		// collection's `_id`; use a deterministic string key that includes the
		// region value and the source row's own `_id` so distinct rows never
		// share one exception document.
		const exceptionId = idValid
			? sourceBook._id
			: [
					asin,
					regionState,
					regionState === 'value' ? String(sourceBook.region) : '',
					`${typeof sourceBook._id}:${String(sourceBook._id)}`
				].join('::')
		const doc: Document = {
			_id: exceptionId,
			asin,
			region,
			reasons
		}
		if (typeof sourceBook.image === 'string' && sourceBook.image) doc.storedUrl = sourceBook.image
		const createdAt = sourceBook.createdAt
		if (createdAt instanceof Date) doc.importedAt = createdAt
		else if (typeof createdAt === 'string' && !Number.isNaN(Date.parse(createdAt)))
			doc.importedAt = new Date(createdAt)
		await this.collection<Document>(COLLECTIONS.identityException).updateOne(
			{ _id: doc._id },
			{ $set: doc },
			{ upsert: true, session }
		)
	}

	// ───────────────────────── entry points ─────────────────────────

	/**
	 * Atomically create/reuse the state document (insertion-only empty
	 * defaults) and advance `allocatedGeneration` and `stateVersion`.
	 * Identity is resolved before allocation, so a stale create attempt
	 * never signals "reserved". A failed fetch may consume a generation but
	 * establishes no resources.
	 */
	async reserveGeneration(asin: string, region: string): Promise<number> {
		return await this.withTx(async (session) => {
			const resolution = await this.resolveCurrent(session, asin, region)
			if (
				!resolution.trustedBook &&
				(resolution.exactCount > 1 || resolution.competitorCount > 0)
			) {
				this.conflictError(asin)
			}
			const stateCol = this.collection<StateDoc>(COLLECTIONS.state)
			const key = bookKey(asin, region)
			const existing = (await stateCol.findOne({ _id: key }, { session })) as StateDoc | null
			if (!existing) await stateCol.insertOne(emptyState(asin, region), { session })
			const updated = (await stateCol.findOneAndUpdate(
				{ _id: key },
				{ $inc: { allocatedGeneration: 1, stateVersion: 1 } },
				{ session, returnDocument: 'after' }
			)) as StateDoc | null
			if (!updated) throw new Error(`History state missing after reservation for ${key}`)
			if (updated.allocatedGeneration > GENERATION_LIMIT)
				throw new Error(`History generation counter overflow for ${key}`)
			return updated.allocatedGeneration
		})
	}

	/**
	 * Apply an accepted book transactionally. In-transaction outcome order:
	 * identity, stale fence, pre-order, equality/genre guard, first-touch
	 * legacy capture, comparison, asset upserts, optional revision (at most
	 * one for changed fields), current book write, state watermark. The
	 * stale check runs on the transaction's state snapshot; no generation is
	 * consumed for stale work.
	 */
	async persistObservation(input: PersistInput): Promise<PersistResult> {
		const { asin, region, generation, book, observation } = input
		return await this.withTx(async (session) => {
			const key = bookKey(asin, region)
			const stateCol = this.collection<StateDoc>(COLLECTIONS.state)
			const state = (await stateCol.findOne({ _id: key }, { session })) as StateDoc | null
			const resolution = await this.resolveCurrent(session, asin, region)
			const currentBook = resolution.trustedBook

			if (
				!resolution.trustedBook &&
				(resolution.exactCount > 0 || resolution.competitorCount > 0)
			) {
				this.conflictError(asin)
			}

			// 1. Stale fence: generation no newer than the accepted watermark
			//    or the delete fence → no writes at all.
			if (state && (generation <= state.acceptedGeneration || generation <= state.deleteFence)) {
				return {
					data: toApiBook(currentBook),
					modified: false,
					disposition: 'stale'
				}
			}
			// 2. Pre-order: existing row + future release → transient, no
			// resources.
			if (currentBook && isPreOrderBook(book)) {
				return { data: book, modified: false, disposition: 'transient' }
			}

			// 3. First-touch legacy capture: archive the still-stored image
			// for every accepted run against an existing row, including the
			// equal short-circuit below. May insert an asset and advance
			// assetSequence, which downstream upserts must account for.
			let legacyCaptured = state?.legacyCaptured ?? false
			let newAssetSequence = 0
			if (currentBook && !legacyCaptured) {
				newAssetSequence = await this.captureLegacy(session, asin, region, currentBook)
				legacyCaptured = true
			}
			const baseSequence = Math.max(state?.assetSequence ?? 0, newAssetSequence)

			// 4. Equality/genre guard re-evaluated against the transaction
			//    book. Both sides normalize through the same constrained
			//    projection, so stored documents (papr-stamped fields,
			//    insertion-ordered keys) compare equally with fresh API books.
			const parsedBook = ApiBookSchema.safeParse(book)
			const normBook = parsedBook.success ? parsedBook.data : book
			const oldApi = toApiBook(currentBook)
			if (currentBook && oldApi) {
				// Series keys present only on the stored side are not changes
				// when the incoming observation has no series evidence at
				// all: the write path retains them (unknown evidence), so the
				// equality result must match the write and stay in the equal
				// short-circuit. Any series evidence in the book or
				// observation (including explicit null-value removals) falls
				// back to full comparison.
				const incomingHasSeriesEvidence =
					SERIES_FIELDS.some(
						(field) => field in (normBook as unknown as Record<string, unknown>)
					) ||
					observation.fields.some(
						(f) => f.field === 'seriesPrimary' || f.field === 'seriesSecondary'
					)
				if (deepEqualBookIgnoringStoredOnlySeries(oldApi, normBook, incomingHasSeriesEvidence)) {
					// Equal public projection is still an accepted
					// observation: rendition transitions can change without
					// touching any public field, and an established state
					// with empty baselines (seeded pre-history row) must be
					// initialised from this observation.
					const equalBaselines = this.decodeBaselines(state)
					const equalComparison = compareBookObservation(equalBaselines, observation)
					const equalSequence = await this.upsertArtworkRefs(
						session,
						asin,
						region,
						observation,
						baseSequence
					)
					const revisionAdvance =
						equalComparison.changedFields.length > 0 ? (state?.revision ?? 0) + 1 : 0
					if (revisionAdvance > 0) {
						// Rendition-only transition: one revision document.
						await this.insertRevision(
							session,
							asin,
							region,
							revisionAdvance,
							generation,
							observation.observedAt,
							equalComparison
						)
					}
					await this.applyWatermark(
						session,
						asin,
						region,
						state,
						generation,
						observation.observedAt,
						equalComparison,
						legacyCaptured,
						revisionAdvance > 0 ? revisionAdvance : undefined,
						equalSequence
					)
					return { data: oldApi, modified: false, disposition: 'accepted' }
				}
				if (!genreSafeguardPasses(currentBook, book)) {
					// Step 3's first-touch legacy capture already persisted
					// its assetSequence advance to the state row in this
					// transaction, so a later accepted observation cannot
					// re-insert at the same sequence and trip the unique
					// artwork_order index; only the legacyCaptured watermark
					// and the stateVersion bump are non-redundant here.
					// reserveGeneration (the sole caller's precondition)
					// inserts the state doc and state docs are never deleted,
					// so `state` is always present.
					if (!state) throw new Error(`History state missing for ${key}`)
					await stateCol.updateOne(
						{ _id: state._id },
						{ $set: { legacyCaptured, stateVersion: state.stateVersion + 1 } },
						{ session }
					)
					return { data: oldApi, modified: false, disposition: 'rejected' }
				}
			}

			// 5. Compare against same-policy baselines (validated at the
			// read boundary — a malformed stored value is a server fault,
			// not a silent comparison input).
			const comparison = compareBookObservation(this.decodeBaselines(state), observation)
			const changed = comparison.changedFields.length > 0
			const nextRevision = (state?.revision ?? 0) + (changed ? 1 : 0)

			// 6. Gallery asset upserts for every returned rendition,
			//    including unparsed references. `baseSequence` already
			//    accounts for step 3's legacy asset; the result is the
			//    final in-transaction counter.
			const finalSequence = await this.upsertArtworkRefs(
				session,
				asin,
				region,
				observation,
				baseSequence
			)

			// 7. At most one revision document for this observation's
			//    changed fields.
			if (changed) {
				await this.insertRevision(
					session,
					asin,
					region,
					nextRevision,
					generation,
					observation.observedAt,
					comparison
				)
			}

			// 8. Current book: real create or accepted unequal projection.
			const booksCol = this.collection<Document>(COLLECTIONS.books)
			let returned: ApiBook
			if (!currentBook) {
				const now = new Date()
				await booksCol.insertOne(
					{ ...book, _id: new ObjectId(), createdAt: now, updatedAt: now },
					{ session }
				)
				returned = toApiBook(book) ?? book
			} else {
				// `$set` alone cannot clear a field the observation explicitly
				// removed: an observation declaring a series key ABSENT or
				// carrying an explicit null value (the producer's signal for a
				// vanished series) normalizes to an absent key, so explicitly
				// unset the cleared series fields that are still present on the
				// stored row to keep the baseline and the row in step. A
				// series-less observation is UNKNOWN evidence — the comparison
				// contract retains unknown evidence — so it must NOT unset:
				// the row keeps its stored series until a removal is observed.
				const unset: Record<string, 1> = {}
				const clearedSeries = new Set(
					observation.fields
						.filter(
							(f) =>
								f.value.state === 'absent' || (f.value.state === 'value' && f.value.value === null)
						)
						.map((f) => f.field)
				)
				if ('seriesPrimary' in currentBook && clearedSeries.has('seriesPrimary'))
					unset.seriesPrimary = 1
				if ('seriesSecondary' in currentBook && clearedSeries.has('seriesSecondary'))
					unset.seriesSecondary = 1
				await booksCol.updateOne(
					{ _id: currentBook._id },
					{
						$set: { ...normBook },
						...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
						$currentDate: { updatedAt: true }
					},
					{ session }
				)
				// The returned/cached projection must reflect the row's
				// resulting state: a series key that is retained (not
				// declared absent) but absent from the incoming book keeps its
				// stored value, so the API serves the series that the row
				// still carries.
				const retained: Record<string, unknown> = {
					...(normBook as unknown as Record<string, unknown>)
				}
				for (const field of ['seriesPrimary', 'seriesSecondary'] as const) {
					if (
						!unset[field] &&
						!(field in retained) &&
						field in (currentBook as Record<string, unknown>)
					) {
						retained[field] = (currentBook as Record<string, unknown>)[field]
					}
				}
				returned = toApiBook(retained as Document) ?? (retained as ApiBook)
			}

			// 9. Watermark. A fresh state must retain the counter the
			// in-transaction asset inserts (legacy capture, gallery
			// upserts) already advanced.
			await this.applyWatermark(
				session,
				asin,
				region,
				state,
				generation,
				observation.observedAt,
				comparison,
				legacyCaptured,
				nextRevision,
				finalSequence
			)

			return { data: returned, modified: true, disposition: 'accepted' }
		})
	}

	/**
	 * Read the stored state baselines back through the shared Zod value
	 * schema: a malformed `value` envelope is a server fault (500), never a
	 * silent comparison input. (The store must not import
	 * `#config/models/BookHistory` — that would create a papr cycle — so the
	 * decode is local, mirroring the model's `decodeStateBaselines`.)
	 */
	private decodeBaselines(state: StateDoc | null): HistoryBaselines {
		if (!state) return { fields: [], renditions: [] }
		const fields: FieldBaseline[] = (state.fields ?? []).map((entry) => ({
			field: entry.field,
			policy: entry.policy,
			value: HistoryValueSchema.parse(entry.value),
			baselineAt: entry.baselineAt
		}))
		const renditions: RenditionBaseline[] = (state.renditions ?? []).map((entry) => ({
			rendition: entry.rendition,
			policy: entry.policy,
			imageId: entry.imageId,
			sourceUrl: entry.sourceUrl,
			baselineAt: entry.baselineAt
		}))
		return { fields, renditions }
	}

	/** Insert one immutable revision document for a comparison's changes. */
	private async insertRevision(
		session: ClientSession,
		asin: string,
		region: string,
		revision: number,
		generation: number,
		observedAt: Date,
		comparison: ComparisonResult
	): Promise<void> {
		await this.collection<Document>(COLLECTIONS.revision).insertOne(
			{
				asin,
				region,
				revision,
				generation,
				observedAt,
				changedFields: [...comparison.changedFields],
				policies: comparison.policies,
				changes: comparison.changes
			},
			{ session }
		)
	}

	private async applyWatermark(
		session: ClientSession,
		asin: string,
		region: string,
		state: StateDoc | null,
		generation: number,
		observedAt: Date,
		comparison: ComparisonResult | null,
		legacyCaptured: boolean,
		nextRevision?: number,
		startSequence = 0
	): Promise<void> {
		const stateCol = this.collection<StateDoc>(COLLECTIONS.state)
		const hadBaselines = (state?.fields?.length ?? 0) > 0 || (state?.renditions?.length ?? 0) > 0
		const comparisonHasBaselines =
			(comparison?.fields.length ?? 0) > 0 || (comparison?.renditions.length ?? 0) > 0
		// `startedAt` marks the first source-known live baseline. It is set
		// only when baselines exist after the write (initialized by this
		// observation or retained from prior state); establishment alone —
		// e.g. seed-only or baseline-less acceptance — leaves it unset.
		const startsCoverage = !hadBaselines && comparisonHasBaselines
		if (!state) {
			const fresh = emptyState(asin, region)
			fresh.allocatedGeneration = Math.max(generation, 0)
			fresh.acceptedGeneration = generation
			fresh.established = true
			fresh.legacyCaptured = legacyCaptured
			fresh.assetSequence = Math.max(startSequence, 0)
			fresh.stateVersion = 1
			if (startsCoverage) fresh.startedAt = observedAt
			if (comparison) {
				fresh.fields = comparison.fields
				fresh.renditions = comparison.renditions
				if (comparison.changedFields.length > 0) fresh.revision = 1
			}
			await stateCol.insertOne(fresh, { session })
			return
		}
		const set: Partial<StateDoc> = {
			acceptedGeneration: generation,
			established: true,
			legacyCaptured,
			stateVersion: state.stateVersion + 1
		}
		if (!state.startedAt && startsCoverage) set.startedAt = observedAt
		if (comparison) {
			set.fields = comparison.fields
			set.renditions = comparison.renditions
			set.revision = nextRevision ?? state.revision
		}
		await stateCol.updateOne({ _id: state._id }, { $set: set }, { session })
	}

	/**
	 * Delete the trusted current book transactionally: identity resolution
	 * (exact trusted row, legacy no-region fallback, or conflict), legacy
	 * capture, record the special no-region legacy delete as an identity
	 * exception, delete by verified _id, then state watermark + delete
	 * fence (current `allocatedGeneration`) with stateVersion increment.
	 * `acceptedGeneration` is unchanged; baselines, revisions, and assets
	 * survive.
	 */
	async deleteCurrent(
		asin: string,
		region: string
	): Promise<{ data: DeleteResult; modified: boolean }> {
		const result = await this.withTx(async (session) => {
			const resolution = await this.resolveCurrent(session, asin, region)
			const booksCol = this.collection<Document>(COLLECTIONS.books)

			if (!resolution.trustedBook && resolution.exactCount === 0) {
				// Legacy fallback: a single competitor row (region missing,
				// null, or unsupported — the same definition resolveCurrent
				// counts) and no other competitor.
				if (resolution.competitorCount > 1) this.conflictError(asin)
				const legacy = (
					await booksCol
						.find({ asin, region: { $nin: SUPPORTED_REGIONS } }, { session })
						.limit(1)
						.toArray()
				)[0]
				if (!legacy) {
					const empty: DeleteResult = { acknowledged: true, deletedCount: 0 }
					return empty
				}
				await this.recordIdentityException(session, legacy)
				return (await booksCol.deleteOne({ _id: legacy._id }, { session })) as DeleteResult
			}
			if (!resolution.trustedBook) this.conflictError(asin)
			const trusted = resolution.trustedBook

			const deleteLegacySequence = await this.captureLegacy(session, asin, region, trusted)
			const del = (await booksCol.deleteOne({ _id: trusted._id }, { session })) as DeleteResult

			const stateCol = this.collection<StateDoc>(COLLECTIONS.state)
			const key = bookKey(asin, region)
			const state = (await stateCol.findOne({ _id: key }, { session })) as StateDoc | null
			if (state) {
				await stateCol.updateOne(
					{ _id: state._id },
					{
						$set: {
							deleteFence: state.allocatedGeneration,
							established: true,
							legacyCaptured: true,
							assetSequence: Math.max(state.assetSequence, deleteLegacySequence),
							stateVersion: state.stateVersion + 1
						}
					},
					{ session }
				)
			} else {
				const fresh = emptyState(asin, region)
				fresh.established = true
				fresh.legacyCaptured = true
				fresh.assetSequence = deleteLegacySequence
				fresh.stateVersion = 1
				await stateCol.insertOne(fresh, { session })
			}
			return del
		})
		return { data: result, modified: result.deletedCount > 0 }
	}

	// ───────────────────────── gallery asset upserts ─────────────────────────

	private async upsertArtworkRefs(
		session: ClientSession,
		asin: string,
		region: string,
		observation: BookObservation,
		startSequence: number
	): Promise<number> {
		const observedAt = observation.observedAt
		let nextSequence = startSequence
		const artwork = this.collection<Document>(COLLECTIONS.artwork)
		for (const ref of observation.artwork) {
			const imageId = parseArtworkReference(ref.sourceUrl)
			const keyFilter = imageId !== null ? { imageId } : { unparsedKey: sha256Hex(ref.sourceUrl) }
			const existing = (
				await artwork
					.find({ asin, region, ...keyFilter } as Document, { session })
					.limit(1)
					.sort({ sequence: 1 })
					.toArray()
			)[0]
			const entry: {
				rendition: string
				firstSourceUrl: string
				sourceUrl: string
				firstObservedAt: Date
				observedAt: Date
			} = {
				rendition: ref.rendition,
				firstSourceUrl: ref.sourceUrl,
				sourceUrl: ref.sourceUrl,
				firstObservedAt: observedAt,
				observedAt
			}
			if (existing) {
				const renditions: Array<{
					rendition: string
					firstSourceUrl: string
					sourceUrl: string
					firstObservedAt: Date
					observedAt: Date
				}> = Array.isArray(existing.renditions) ? existing.renditions : []
				const current = renditions.find((r) => r.rendition === ref.rendition)
				if (current) {
					if (current.sourceUrl !== ref.sourceUrl) {
						current.sourceUrl = ref.sourceUrl
						current.observedAt = observedAt
					}
				} else {
					renditions.push(entry)
				}
				await artwork.updateOne({ _id: existing._id }, { $set: { renditions } }, { session })
				continue
			}
			nextSequence += 1
			const doc: Document = {
				asin,
				region,
				sequence: nextSequence,
				renditions: [entry]
			}
			if (imageId !== null) doc.imageId = imageId
			else doc.unparsedKey = sha256Hex(ref.sourceUrl)
			await artwork.insertOne(doc, { session })
		}
		if (nextSequence !== startSequence) {
			// The state document is only absent on the fresh-create path
			// (no prior state row); the caller's `applyWatermark` inserts
			// the state with the final sequence in the same transaction, so
			// skipping the $set here is the intended tolerated-missing case.
			await this.collection<StateDoc>(COLLECTIONS.state).updateOne(
				{ _id: bookKey(asin, region) },
				{ $set: { assetSequence: nextSequence } },
				{ session }
			)
		}
		return nextSequence
	}

	// ───────────────────── activation gate ─────────────────────

	/**
	 * Prove the deployment is ready for recording: replica set, all named
	 * index definitions present with matching keys/uniqueness, and one
	 * transactional full-shape probe row inserted + deleted in a committed
	 * majority transaction (leaving nothing behind, touching no
	 * history/current records).
	 */
	async assertHistoryPrerequisites(): Promise<void> {
		const failure = (): Error =>
			new Error(
				'BOOK_HISTORY_ENABLED requires a transaction-capable MongoDB replica set and prepared history indexes'
			)
		let helloName: string | undefined
		try {
			const hello = (await this.requireClient().db('admin').command({ hello: 1 })) as {
				setName?: string
			}
			helloName = hello.setName
		} catch {
			throw failure()
		}
		if (!helloName) throw failure()
		const db = this.requireClient().db('audnexus')
		for (const def of HISTORY_INDEX_DEFINITIONS) {
			let indexes: Array<{
				name: string
				key: Record<string, number>
				unique?: boolean
				partialFilterExpression?: Record<string, unknown>
			}>
			try {
				indexes = (await db.collection(def.collection).listIndexes().toArray()) as typeof indexes
			} catch (error) {
				// A not-yet-created collection reports "ns not found" (code 26);
				// map it to the stable failure message like every other
				// unprepared state. Any other error (e.g. code 13 unauthorized)
				// keeps its own diagnostics.
				if (error && typeof error === 'object' && 'code' in error && error.code === 26) {
					throw failure()
				}
				throw error
			}
			const match = indexes.find((idx) => idx.name === def.name)
			if (!match) throw failure()
			const keysEqual =
				Object.keys(match.key).length === Object.keys(def.keys).length &&
				Object.entries(def.keys).every(([k, v]) => match.key[k] === v)
			if (!keysEqual) throw failure()
			// A same-name index without the expected string-only partial
			// filter would pass the gate and then fail at runtime with
			// duplicate-key errors on gallery inserts.
			const partialEqual =
				JSON.stringify(match.partialFilterExpression ?? null) ===
				JSON.stringify(def.partialFilterExpression ?? null)
			if (!partialEqual) throw failure()
			// MongoDB reports `_id` indexes without a `unique` flag — they
			// are unique by construction.
			const isIdIndex = Object.keys(def.keys).length === 1 && def.keys._id === 1
			if (def.unique === true && !isIdIndex && match.unique !== true) throw failure()
			if (def.unique !== true && !isIdIndex && match.unique === true) throw failure()
		}
		const probeId = `probe-${randomUUID()}`
		try {
			// The probe rides on the seed-progress collection by design: it
			// needs any history-owned, transaction-capable collection, and
			// this one is always present once `prepare` has run.
			const probe = this.collection<SeedProgressDoc>(COLLECTIONS.seedProgress)
			await this.withTx(async (session) => {
				const now = new Date()
				await probe.insertOne(
					{ _id: probeId, runId: probeId, completed: false, startedAt: now, updatedAt: now },
					{ session }
				)
				await probe.deleteOne({ _id: probeId }, { session })
			})
		} catch {
			throw failure()
		}
	}

	// ───────────────────── seed progress (shared with CLI) ─────────────────────

	static get seedProgressId(): string {
		return SEED_PROGRESS_ID
	}

	/** Run work inside the store's majority snapshot transaction. */
	async withSeedTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
		return this.withTx(fn)
	}

	/** Signals a seed worker whose run was superseded by `--restart`. */
	static readonly SUPERSEDED = 'Seed run superseded'

	/**
	 * Seed one source row inside the caller's transaction: reread it by
	 * verified `_id` (skip deleted rows), re-resolve identity, merge only
	 * pending state plus the legacy reference for trusted identities
	 * (`established=true`, even without a stored image), or upsert an
	 * unscoped identity exception for unresolved/duplicate identities.
	 * Never copies editorial values into baselines, never emits a revision,
	 * never changes current metadata/timestamps, and never resets
	 * `legacyCaptured`. The singleton checkpoint's `runId` is re-read inside
	 * the transaction; a superseded run stops before its next write. The
	 * checkpoint is advanced conditionally (same `runId`, same `_id` bound)
	 * after the row's successful work, in the same transaction. Concurrency
	 * safety: a run superseded mid-flight is detected by the checkpoint
	 * `runId` recheck at the row's start and by the write-conflict abort of
	 * its conditional checkpoint advance (matchedCount 0), so a stale runner
	 * commits no progress after `--restart`.
	 *
	 * Returns the outcome: `captured` (legacy reference stored/merged),
	 * `exception` (unresolvable identity recorded), `noState` (row gone), or
	 * `cleared` (trusted row, no image to retain — state merged only).
	 */
	async seedRow(
		session: ClientSession,
		bookId: ObjectId,
		runId: string
	): Promise<'captured' | 'exception' | 'noState' | 'cleared'> {
		const progress = this.collection<SeedProgressDoc>(COLLECTIONS.seedProgress)
		const checkpoint = (await progress.findOne(
			{ _id: SEED_PROGRESS_ID },
			{ session }
		)) as SeedProgressDoc | null
		if (checkpoint && checkpoint.runId !== runId) {
			throw new Error(BookHistoryStore.SUPERSEDED)
		}
		const row = (await this.collection<Document>(COLLECTIONS.books).findOne(
			{ _id: bookId },
			{ session }
		)) as Document | null
		if (row) {
			const asin = String(row.asin)
			const asinValid = typeof row.asin === 'string' && asin10Regex.test(row.asin)
			if (asinValid) {
				const supported = isSupportedRegionValue(row.region)
				const resolution = supported
					? await this.resolveCurrent(session, asin, row.region as string)
					: { trustedBook: null, exactCount: 0, competitorCount: 1 }
				if (resolution.trustedBook) {
					const image = typeof row.image === 'string' && row.image ? row.image : undefined
					const legacySequence = image
						? await this.captureLegacy(session, asin, row.region as string, row)
						: 0
					const key = bookKey(asin, row.region as string)
					const stateCol = this.collection<StateDoc>(COLLECTIONS.state)
					const state = (await stateCol.findOne({ _id: key }, { session })) as StateDoc | null
					if (state && !state.established) {
						// Merge only a pending state; an established state
						// keeps its counters and baselines untouched.
						await stateCol.updateOne(
							{ _id: key, established: false },
							{
								$set: {
									established: true,
									legacyCaptured: true,
									assetSequence: Math.max(state.assetSequence, legacySequence),
									stateVersion: state.stateVersion + 1
								}
							},
							{ session }
						)
					} else if (!state) {
						const fresh = emptyState(asin, row.region as string)
						fresh.established = true
						fresh.legacyCaptured = true
						fresh.assetSequence = legacySequence
						fresh.stateVersion = 1
						await stateCol.insertOne(fresh, { session })
					}
					return image ? 'captured' : 'cleared'
				}
			}
			await this.recordIdentityException(session, row, { asinValid })
			return 'exception'
		}
		return 'noState'
	}

	/**
	 * Conditionally advance the singleton seed checkpoint inside the
	 * caller's transaction: same `runId` and (when given) the expected
	 * previous watermark. A superseded run cannot advance or complete: its
	 * `runId` no longer matches, its expected watermark no longer matches,
	 * or the in-transaction write conflicts and the whole transaction
	 * aborts. Returns the documents matched (0 means superseded/stale bound).
	 *
	 * The first advance (`expectLastId === null`) is additionally compatible
	 * with a *cooperating* joiner: a runner that joined this run on E11000
	 * (see the `seed()` join path) may find the stored watermark already
	 * advanced past its own expected-null by the run's winner. In that case
	 * the first write is idempotent (re-writing the current watermark), so
	 * matching the stored watermark is allowed — the joiner rebases onto the
	 * winner's progress and continues. Only the `runId` recheck and the
	 * expected-watermark fence on subsequent advances reject a genuinely
	 * superseded/stale runner.
	 */
	async seedCheckpoint(
		session: ClientSession,
		runId: string,
		lastId: ObjectId,
		expectLastId: ObjectId | null
	): Promise<number> {
		const filter: Record<string, unknown> = { _id: SEED_PROGRESS_ID, runId }
		if (expectLastId) {
			if (expectLastId.equals(lastId)) return 0
			filter.lastId = expectLastId
		} else {
			// First advance: require the stored checkpoint to still be at its
			// initial position OR already advanced to the value being written.
			// A cooperating joiner (joined the run on E11000) reads the winner's
			// already-advanced watermark back and must be able to continue
			// idempotently; only a genuinely stale runner is superseded here.
			filter.lastId = { $in: [null, lastId] }
		}
		const result = await this.collection<SeedProgressDoc>(COLLECTIONS.seedProgress).updateOne(
			filter,
			{ $set: { lastId, updatedAt: new Date() } },
			{ session }
		)
		return result.matchedCount
	}

	/**
	 * Mark the singleton seed run completed atomically for its `runId`.
	 * Returns the documents matched (0 means superseded).
	 */
	async seedComplete(session: ClientSession, runId: string): Promise<number> {
		const result = await this.collection<SeedProgressDoc>(COLLECTIONS.seedProgress).updateOne(
			{ _id: SEED_PROGRESS_ID, runId },
			{ $set: { completed: true, updatedAt: new Date() } },
			{ session }
		)
		return result.matchedCount
	}
}
