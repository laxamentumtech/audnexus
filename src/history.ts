// DB-only operational CLI for the book history feature. Every command runs
// directly against `MONGODB_URI` (no upstream fetches, no Redis, no
// Fastify):
//
//   node dist/history.js audit     report current-book readiness issues (NDJSON)
//   node dist/history.js prepare   Papr schema prep + named history indexes
//   node dist/history.js seed      resumable per-row legacy artwork seed
//   node dist/history.js seed --restart   supersede the run (new runId)
//   node dist/history.js status    seed state + retained-data counts
//
// Seed protocol: one singleton checkpoint (`book_history_seed_progress`),
// one `runId` per fresh/restarted run, a `lastId` watermark advanced in the
// same transaction as each row's committed work, and an initial `upperId`
// captured once per run. Rows are serial within a runner; independent
// concurrent runners make idempotent attempts and conditionally advance
// the checkpoint. `--restart` atomically creates a new runId and clears
// only scan progress/upper bound — never history data.

import { MongoClient, ObjectId } from 'mongodb'
import { pathToFileURL } from 'node:url'

import { HISTORY_INDEX_DEFINITIONS, SEED_PROGRESS_ID } from '#config/bookHistory'
import { bookHistoryStore } from '#config/papr'
import { parseArtworkReference } from '#helpers/books/audible/BookObservation'
import { BookHistoryStore } from '#helpers/database/papr/BookHistoryStore'
import { iterateKeyset } from '#helpers/utils/keyset'
import { regions } from '#static/regions'

const COMMANDS = ['audit', 'prepare', 'seed', 'status'] as const
type Command = (typeof COMMANDS)[number]
const SEED_BATCH_SIZE = 500
const BOOKS_COLLECTION = 'books'
/** Deterministic 10-char ASIN shape (B-prefixed or numeric, X check suffix). */
const ASIN_REGEX = /^(B[0-9A-Z]{9}|\d{9}(X|\d))$/

/** Tagged region representation: missing, null, and value are distinct. */
type RegionTag =
	| { state: 'missing' | 'null'; value?: undefined }
	| { state: 'value'; value: string }
const VALID_REGIONS = new Set(Object.keys(regions))

function regionTag(region: unknown): RegionTag {
	if (region === undefined) return { state: 'missing' }
	if (region === null) return { state: 'null' }
	return { state: 'value', value: String(region) }
}

function isSupportedRegion(region: unknown): region is string {
	return typeof region === 'string' && VALID_REGIONS.has(region)
}

function fail(message: string, code: number): never {
	console.error(message)
	process.exit(code)
}

/** Main guard portable across Bun and Node (no Bun-only APIs). */
function isMainEntry(): boolean {
	const entry = process.argv[1]
	if (!entry) return false
	try {
		return pathToFileURL(entry).href === import.meta.url
	} catch {
		return false
	}
}

async function connect(): Promise<MongoClient> {
	const uri = process.env.MONGODB_URI
	if (!uri) fail('MONGODB_URI environment variable is required', 2)
	const client = await MongoClient.connect(uri)
	bookHistoryStore.configure(client)
	return client
}

// ───────────────────────── audit ─────────────────────────

interface BookRow {
	_id: unknown
	asin?: unknown
	region?: string | null
	image?: unknown
}

/**
 * Raw read-only audit over the current books collection (no Papr schema
 * synchronization, no state creation). Streams bounded `_id` batches and
 * reports one NDJSON `identity_exception` row per problematic source,
 * closed by one `summary` row. Never guesses regions, repairs data, or
 * contacts upstream.
 */
async function audit(
	client: MongoClient,
	emit: (row: Record<string, unknown>) => void = (row) => console.log(JSON.stringify(row))
): Promise<{ type: 'summary'; counts: Record<string, number> }> {
	const col = client.db('audnexus').collection<BookRow>(BOOKS_COLLECTION)
	let scanned = 0
	let trusted = 0
	const counters = {
		invalidAsin: 0,
		missingRegion: 0,
		invalidRegion: 0,
		duplicateIdentity: 0,
		ambiguousIdentity: 0,
		recognizedImages: 0,
		unparsedImages: 0,
		noImage: 0,
		unsupportedId: 0
	}
	const pairCounts = new Map<string, number>()
	const competitorCounts = new Map<string, number>()

	/** One bounded ascending `_id` batch walk. */
	const walk = async (
		project: Record<string, 1> | undefined,
		onRow: (row: BookRow) => void
	): Promise<void> => {
		let lastId: ObjectId | null = null
		for (;;) {
			const filter: Record<string, unknown> = lastId === null ? {} : { _id: { $gt: lastId } }
			const batch = (await col
				.find(filter as never)
				.sort({ _id: 1 } as never)
				.limit(SEED_BATCH_SIZE)
				.project((project ?? { _id: 1, asin: 1, region: 1, image: 1 }) as never)
				.toArray()) as BookRow[]
			if (batch.length === 0) break
			for (const row of batch) onRow(row)
			const lastIdValue = batch[batch.length - 1]._id
			if (!(lastIdValue instanceof ObjectId)) return // cannot continue the walk
			lastId = lastIdValue
		}
	}

	// Pass 1: bounded walk; count identity dimensions and report row-level
	// issues (invalid ASIN / region, unsupported _id, image parseability).
	await walk(undefined, (row) => {
		scanned++
		const asinValid = typeof row.asin === 'string' && ASIN_REGEX.test(row.asin)
		const tag = regionTag(row.region)
		const reasons: string[] = []
		const storedUrl = typeof row.image === 'string' && row.image.length > 0 ? row.image : null
		if (!(row._id instanceof ObjectId)) {
			counters.unsupportedId++
			reasons.push('unsupported_id')
		}
		if (!asinValid) {
			counters.invalidAsin++
			reasons.push('invalid_asin')
		}
		if (tag.state === 'missing') {
			counters.missingRegion++
			reasons.push('missing_region')
		} else if (tag.state === 'null' || !isSupportedRegion(row.region)) {
			counters.invalidRegion++
			reasons.push('invalid_region')
		}
		if (storedUrl === null) counters.noImage++
		else if (parseArtworkReference(storedUrl) !== null) counters.recognizedImages++
		else counters.unparsedImages++
		if (reasons.length > 0) {
			emit({
				type: 'identity_exception',
				sourceBookId: String(row._id),
				asin: row.asin ?? null,
				region: tag,
				storedUrl,
				reasons
			})
		}
		const asin = String(row.asin)
		if (isSupportedRegion(row.region)) {
			const key = `${row.region}:${asin}`
			pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
		} else {
			competitorCounts.set(asin, (competitorCounts.get(asin) ?? 0) + 1)
		}
	})

	// Pass 2: bounded walk classifying pair-level identity outcomes using
	// the pass-1 dimension counts.
	await walk({ _id: 1, asin: 1, region: 1 }, (row) => {
		const asinValid = typeof row.asin === 'string' && ASIN_REGEX.test(row.asin)
		const asin = String(row.asin)
		if (!asinValid || !isSupportedRegion(row.region)) return
		const exact = pairCounts.get(`${row.region}:${asin}`) ?? 0
		const competitors = competitorCounts.get(asin) ?? 0
		if (exact === 1 && competitors === 0) trusted++
		else if (exact > 1) counters.duplicateIdentity++
		else if (competitors > 0) counters.ambiguousIdentity++
	})

	const summary = { type: 'summary' as const, counts: { scanned, trusted, ...counters } }
	emit(summary)
	return summary
}

// ───────────────────────── prepare ─────────────────────────

/**
 * Register the history models, run ordinary Papr schema preparation, and
 * create the named history indexes idempotently. A same-name conflicting
 * index definition fails with the name and stops; indexes are never
 * replaced/dropped.
 */
async function prepare(client: MongoClient): Promise<void> {
	const { initialize } = await import('#config/papr')
	await initialize({ client } as never, { bookHistoryEnabled: false })
	let failed = false
	const db = client.db('audnexus')
	for (const def of HISTORY_INDEX_DEFINITIONS) {
		try {
			let indexes: Array<{ name: string; key: Record<string, number>; unique?: boolean }>
			try {
				indexes = (await db.collection(def.collection).listIndexes().toArray()) as Array<{
					name: string
					key: Record<string, number>
					unique?: boolean
				}>
			} catch (probeError) {
				// Namespace does not exist (code 26): no indexes; createIndex
				// creates the namespace itself.
				if ((probeError as { code?: number }).code !== 26) throw probeError
				indexes = []
			}
			const existing = indexes.find((idx) => idx.name === def.name)
			if (existing !== undefined) {
				const sameKeys =
					Object.keys(existing.key).length === Object.keys(def.keys).length &&
					Object.entries(def.keys).every(([k, v]) => existing.key[k] === v)
				const isIdIndex =
					Object.keys(def.keys).length === 1 && (def.keys as Record<string, 1>)._id === 1
				if (
					!sameKeys ||
					(def.unique === true && !existing.unique && !isIdIndex) ||
					(def.unique !== true && existing.unique && !isIdIndex)
				) {
					console.error(
						`index '${def.name}' on ${def.collection}: conflicting definition; refusing to replace it`
					)
					failed = true
					continue
				}
				console.log(`index ${def.name}: exists`)
				continue
			}
			await db.collection(def.collection).createIndex(def.keys, {
				name: def.name,
				...(def.unique === true &&
				!(Object.keys(def.keys).length === 1 && (def.keys as Record<string, 1>)._id === 1)
					? { unique: true }
					: {}),
				...(def.partialFilterExpression && {
					partialFilterExpression: def.partialFilterExpression
				})
			})
			console.log(`index ${def.name}: created`)
		} catch (error) {
			console.error(`index ${def.name}: ${String((error as Error).message)}`)
			failed = true
		}
	}
	if (failed) process.exit(1)
	console.log('prepare complete')
}

// ───────────────────────── seed ─────────────────────────

interface SeedRow {
	_id: string
	runId: string
	completed: boolean
	startedAt: Date
	updatedAt: Date
	lastId?: ObjectId | null
	upperId?: ObjectId | null
}

async function seed(
	client: MongoClient,
	restart: boolean
): Promise<{ message: string; runId?: string; rows?: number; batches?: number }> {
	// Recording prerequisites: replica set + named prepared indexes.
	await bookHistoryStore.assertHistoryPrerequisites()
	const db = client.db('audnexus')
	const progress = db.collection<SeedRow>('book_history_seed_progress')
	const collections = () =>
		client.db('audnexus').collection<{
			_id: ObjectId
			asin: string
			region?: string | null
			image?: string
		}>(BOOKS_COLLECTION)

	// Unsupported `_id` types cannot enter the ObjectId keyset walk: report
	// and fail with the actionable count before any import/checkpoint work.
	const unsupported = (await collections()
		.find({ _id: { $not: { $type: 'objectId' } } as never })
		.toArray()) as Array<{ _id: unknown }>
	if (unsupported.length > 0) {
		fail(
			`seed aborted: ${unsupported.length} book row(s) have non-ObjectId _id values; ` +
				`run audit for their identity details (they are not modified here)`,
			1
		)
	}

	const existing = await progress.findOne({ _id: SEED_PROGRESS_ID })
	let checkpoint: SeedRow
	if (existing && !restart && existing.completed) {
		return { message: 'seed already completed', runId: existing.runId, rows: 0, batches: 0 }
	}
	// Capture the run's upper bound once: the initial maximum ObjectId.
	const maxRow = await collections()
		.find({})
		.sort({ _id: -1 } as never)
		.limit(1)
		.project({ _id: 1 })
		.toArray()
	const upperId = (maxRow[0]?._id as ObjectId | undefined) ?? null

	if (restart) {
		const now = new Date()
		const runId = `seed-${Date.now()}-${randomUUIDLike()}`
		const fresh: SeedRow = {
			_id: SEED_PROGRESS_ID,
			runId,
			completed: false,
			startedAt: now,
			updatedAt: now
		}
		// The schema is single-typed: null ObjectId fields are omitted,
		// never stored as null.
		if (upperId) fresh.upperId = upperId
		checkpoint = fresh
		await progress.replaceOne({ _id: SEED_PROGRESS_ID }, checkpoint, { upsert: true })
	} else if (existing) {
		checkpoint = existing
	} else {
		const now = new Date()
		const fresh: SeedRow = {
			_id: SEED_PROGRESS_ID,
			runId: `seed-${Date.now()}-${randomUUIDLike()}`,
			completed: false,
			startedAt: now,
			updatedAt: now
		}
		if (upperId) fresh.upperId = upperId
		checkpoint = fresh
		await progress.insertOne(checkpoint)
	}
	const runId = checkpoint.runId
	const lastIdBound = checkpoint.lastId ?? null

	const baseFilter: Record<string, unknown> = {}
	const bounds: Array<Record<string, unknown>> = []
	if (lastIdBound) bounds.push({ _id: { $gt: lastIdBound } })
	// $lte: the initial max row belongs to this run; rows inserted after
	// the bound was captured are excluded.
	if (upperId) bounds.push({ _id: { $lte: upperId } })
	if (bounds.length > 0) baseFilter.$and = bounds

	let rows = 0
	let batches = 0
	// Each row is its own transaction; the checkpoint advances in the same
	// transaction as the row's committed work, so a crash resumes from the
	// last committed row.
	let prev: ObjectId | null = lastIdBound
	await iterateKeyset(
		(filter, options) =>
			collections().find(filter).sort(options.sort).limit(options.limit).toArray(),
		{
			baseFilter: bounds.length ? baseFilter : undefined,
			batchSize: SEED_BATCH_SIZE,
			projection: { asin: 1, region: 1, image: 1 }
		},
		async (batch) => {
			for (const row of batch) {
				const expectedPrev = prev
				await bookHistoryStore.withSeedTransaction(async (session) => {
					await bookHistoryStore.seedRow(session, row._id, runId)
					const matched = await bookHistoryStore.seedCheckpoint(
						session,
						runId,
						row._id,
						expectedPrev
					)
					if (matched === 0) throw new Error(BookHistoryStore.SUPERSEDED)
				})
				prev = row._id
				rows++
			}
			batches++
		}
	)
	await bookHistoryStore.withSeedTransaction(async (session) => {
		const matched = await bookHistoryStore.seedComplete(session, runId)
		if (matched === 0) throw new Error(BookHistoryStore.SUPERSEDED)
	})
	return { message: 'seed complete', runId, rows, batches }
}

function randomUUIDLike(): string {
	// Avoid the node:crypto import for this one identifier; the runId only
	// needs per-process uniqueness, not cryptographic strength.
	return Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
}

// ───────────────────────── status ─────────────────────────

export interface StatusResult {
	seed: {
		runId: string
		lastId: ObjectId | null
		upperId: ObjectId | null
		completed: boolean
	} | null
	pendingStates: number
	activeStates: number
	recognizedAssets: number
	unparsedAssets: number
	retainedIdentityExceptions: number
}

/** DB reads only: one JSON document with seed state and retained counts. */
async function status(client: MongoClient): Promise<StatusResult> {
	const db = client.db('audnexus')
	const doc = (await db.collection<SeedRow>('book_history_seed_progress').findOne({
		_id: SEED_PROGRESS_ID
	})) as SeedRow | null
	const states = (await db
		.collection<{
			_id: string
			established?: boolean
			fields?: unknown[]
			renditions?: unknown[]
		}>('book_history_states')
		.find({ established: true })
		.project({ fields: 1, renditions: 1 })
		.toArray()) as Array<{ fields?: unknown[]; renditions?: unknown[] }>
	let activeStates = 0
	for (const state of states) {
		if ((state.fields?.length ?? 0) > 0 || (state.renditions?.length ?? 0) > 0) activeStates++
	}
	const recognizedAssets = await db
		.collection('book_artwork')
		.countDocuments({ imageId: { $type: 'string' } })
	const unparsedAssets = await db
		.collection('book_artwork')
		.countDocuments({ imageId: { $exists: false }, unparsedKey: { $type: 'string' } })
	const retainedIdentityExceptions = await db
		.collection('book_history_identity_exceptions')
		.countDocuments({})
	return {
		seed: doc
			? {
					runId: doc.runId,
					lastId: doc.lastId ?? null,
					upperId: doc.upperId ?? null,
					completed: Boolean(doc.completed)
				}
			: null,
		pendingStates: states.length - activeStates,
		activeStates,
		recognizedAssets,
		unparsedAssets,
		retainedIdentityExceptions
	}
}

// ───────────────────────── entry ─────────────────────────

async function main(): Promise<void> {
	const command = process.argv[2] as Command
	const restart = process.argv.includes('--restart')
	if (!command || !COMMANDS.includes(command)) {
		fail(`Usage: history <${COMMANDS.join('|')}> [--restart]`, 2)
	}
	if (restart && command !== 'seed') {
		fail('--restart is only valid for the seed command', 2)
	}
	const client = await connect()
	try {
		if (command === 'audit') await audit(client)
		else if (command === 'prepare') await prepare(client)
		else if (command === 'seed') {
			const result = await seed(client, restart)
			console.log(JSON.stringify(result))
		} else {
			const result = await status(client)
			console.log(JSON.stringify(result))
		}
	} finally {
		await client.close()
	}
}

if (isMainEntry()) {
	void main().catch((err) => {
		console.error(String((err as Error).message ?? err))
		process.exit(1)
	})
}

export { audit, prepare, seed, status }
