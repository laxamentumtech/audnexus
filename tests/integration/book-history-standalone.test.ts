// Real-transaction integration for the book history feature against a
// single-node replica set. Covers the store's transactional invariants
// (first-touch baselines with no initial change events, revision + gallery
// writes, equal short-circuit, stale disposition, genre-preserving merge,
// delete survival with legacy capture on re-create) and the read side
// (unparsed artwork retention).
//
// Gating follows the live-test convention: an explicit
// `HISTORY_TEST_MONGODB_URI` replica-set URI, or a running Docker daemon
// (the harness starts a single-node RS on a free port). Neither → the suite
// skips, so `bun run test` stays green on machines without Docker.

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test'
import { MongoClient, ObjectId } from 'mongodb'

import { prepare } from '../../src/history'

import { type HistoryMongo, resolveHistoryMongo } from './env'

import { bookHistoryStore, initialize } from '#config/papr'
import { ApiBookSchema } from '#config/types'
import type { PersistInput } from '#helpers/database/papr/BookHistoryStore'
import BookBackfillHelper from '#helpers/routes/BookBackfillHelper'
import { apiResponse } from '#tests/datasets/helpers/books'
import { createMockLogger } from '#tests/setup/mockLogger'

// The ratings backfill's real fetch path (BookBackfillHelper →
// ApiBatchHelper.fetchProductsByAsin → fetchPlus): only the batch prefetch
// test drives it; the equal-short-circuit and tags tests never fetch.
const mockFetch = mock()
mock.module('#helpers/utils/fetchPlus', () => ({ default: mockFetch }))

const available = (() => {
	if (process.env.HISTORY_TEST_MONGODB_URI) return true
	// A missing docker executable throws ENOENT from spawnSync; `Bun.which`
	// yields null instead, so absent Docker takes the skip path.
	if (Bun.which('docker') === null) return false
	const probe = Bun.spawnSync(['docker', 'info'] as const)
	return probe.exitCode === 0
})()

const ASIN = 'B0HISTINT1'
const REGION = 'us'
const KEY = `${REGION}:${ASIN}`
const IMG1 = 'AAAABBBBCCCCDDDDEEEEFFFGGGHHHHIIIIJJJJKKMM'
const IMG2 = 'NEWNEWNEWNEWNEWNEWNEWNEWNEWNEWNEWNEWNEW1'

// The genre safeguard (reproduced from the original update flow) requires
// non-empty stored genres AND genre evidence on the incoming side (the
// genre-preserving merge applies only when the incoming book carries none),
// so every fixture carries a recognized genre by default; the genre-stripping
// test supplies an explicit empty array, which — carrying no genre evidence —
// the merge DOES apply to.
const GENRES = [{ type: 'genre', asin: '1234567890', name: 'Fiction' }] as const

function book(overrides: Record<string, unknown> = {}) {
	return {
		createdAt: new Date('2020-01-01T00:00:00.000Z'),
		updatedAt: new Date('2020-01-01T00:00:00.000Z'),
		asin: ASIN,
		authors: [{ asin: 'B0AUTHOR01', name: 'Smith, Doe' }],
		description: 'desc',
		formatType: 'audiobook',
		isAdult: false,
		language: 'en',
		publisherName: 'Publisher',
		rating: '4.5',
		region: REGION,
		releaseDate: new Date('2020-01-01T00:00:00.000Z'),
		runtimeLengthMin: 600,
		summary: 'summary',
		title: 'Original Title',
		image: `https://m.media-amazon.com/images/I/${IMG1}.jpg`,
		genres: [...GENRES],
		...overrides
	}
}

function observation(
	overrides: {
		title?: string
		imageId?: string | null
		imageUrl?: string
		tags?: Array<[string, string, string]>
		/** Fields to record with `state: 'absent'` (an explicit empty
		 * value, distinct from omitting the field entirely). */
		absent?: string[]
	} = {}
) {
	const imageId = overrides.imageId !== undefined ? overrides.imageId : IMG1
	const fields = [
		{
			field: 'title',
			policy: 'editorial:title:v1',
			value: { state: 'value', value: overrides.title ?? 'Original Title' },
			source: 'audible_api'
		}
	]
	if (overrides.tags) {
		fields.push({
			field: 'tags',
			policy: 'tags:api:v1',
			value: { state: 'value', value: overrides.tags },
			source: 'audible_api'
		})
	}
	// An explicit empty value (e.g. `tags: []` with `absent: ['tags']`)
	// records `state: 'absent'`, which the history store treats as a
	// deliberate clear — distinct from omitting the field (unknown
	// evidence), which retains the stored value.
	for (const field of overrides.absent ?? []) {
		fields.push({
			field,
			policy: field === 'tags' ? 'tags:api:v1' : 'editorial:title:v1',
			value: { state: 'absent' },
			source: 'audible_api'
		})
	}
	return {
		observedAt: new Date(),
		apiReceivedAt: new Date(),
		responseGroups: ['default'],
		requestedRenditions: ['default'],
		fields,
		artwork: [
			{
				rendition: 'default',
				sourceUrl: overrides.imageUrl ?? `https://m.media-amazon.com/images/I/${imageId}.jpg`,
				imageId
			}
		]
	}
}

function persistInput(input: Partial<PersistInput>): PersistInput {
	return {
		asin: ASIN,
		region: REGION,
		generation: 1,
		book: book(),
		observation: observation(),
		...input
	}
}

let history: HistoryMongo | null = null
let client: MongoClient | null = null
let db: ReturnType<MongoClient['db']> | null = null

const run = available ? describe : describe.skip

run('BookHistoryStore against a replica set', () => {
	beforeAll(async () => {
		history = await resolveHistoryMongo('standalone')
		if (!history) throw new Error('no transaction-capable replica set available')
		client = new MongoClient(history.uri, { serverSelectionTimeoutMS: 5000, ignoreUndefined: true })
		await client.connect()
		// Papr validators first (the store's reads/writes go through papr
		// models).
		await initialize({ client } as never)
		bookHistoryStore.configure(client)
		db = client.db('audnexus')
		await db.dropDatabase()
		// Named history indexes after the drop, so the unique
		// `history_revision`/`artwork_order` indexes are present and
		// exercised for real.
		await prepare(client)
	}, 90000)

	afterAll(async () => {
		if (client) await client.close()
		await history?.stop()
	})

	const collections = () => {
		if (!db) throw new Error('database not initialized')
		return db
	}

	test('first touch initializes baselines and current state without any change events', async () => {
		const result = await bookHistoryStore.persistObservation(
			persistInput({
				book: book({ genres: [{ type: 'genre', asin: '1234567890', name: 'Fiction' }] })
			})
		)
		expect(result.disposition).toBe('accepted')
		expect(result.modified).toBe(true)

		const state = await collections().collection('book_history_states').findOne({ _id: KEY })
		expect(state?.established).toBe(true)
		expect(state?.revision).toBe(0)
		expect(state?.legacyCaptured).toBe(false)
		expect(state?.fields.map((f: { field: string }) => f.field)).toContain('title')
		expect(state?.renditions).toHaveLength(1)

		// No initial change: baselines are initialized from the fresh
		// accepted observation, never emitted as an event.
		const revisions = await collections()
			.collection('book_history_revisions')
			.find({ asin: ASIN, region: REGION })
			.toArray()
		expect(revisions).toHaveLength(0)
	})

	test('a changed title and artwork produce exactly one revision with stored deltas', async () => {
		const result = await bookHistoryStore.persistObservation(
			persistInput({
				generation: 2,
				book: book({
					title: 'Changed Title',
					genres: [{ type: 'genre', asin: '1234567890', name: 'Fiction' }]
				}),
				observation: observation({ title: 'Changed Title', imageId: IMG2 })
			})
		)
		expect(result.disposition).toBe('accepted')
		expect(result.modified).toBe(true)

		const state = await collections().collection('book_history_states').findOne({ _id: KEY })
		expect(state?.revision).toBe(1)

		const revisions = await collections()
			.collection('book_history_revisions')
			.find({ asin: ASIN, region: REGION, revision: 1 })
			.toArray()
		expect(revisions).toHaveLength(1)
		expect(revisions[0].changedFields).toContain('title')
		expect(revisions[0].changedFields).toContain('artwork')
		expect(revisions[0].changes.title.before).toEqual({ state: 'value', value: 'Original Title' })
		expect(revisions[0].changes.title.after).toEqual({ state: 'value', value: 'Changed Title' })
		expect(revisions[0].changes.artwork[0].after.imageId).toBe(IMG2)

		const currentBook = await collections().collection('books').findOne({ asin: ASIN })
		expect(currentBook?.title).toBe('Changed Title')
	})

	test('a tags-only change produces exactly one revision with the tags delta', async () => {
		// Dedicated ASIN: the shared state's generations and baselines are
		// asserted by neighbouring tests, so this flow cannot reuse them.
		// Contract: a field's first observation initializes its baseline
		// silently; a later value change records the revision.
		const tagsAsin = 'B0TAGHIST1'
		const tagsKey = `${REGION}:${tagsAsin}`
		const tagsBook = book({ asin: tagsAsin, title: 'Tags Base' })
		const baseObs = observation({ title: 'Tags Base', imageId: IMG1 })
		await bookHistoryStore.reserveGeneration(tagsAsin, REGION)
		await bookHistoryStore.persistObservation({
			asin: tagsAsin,
			region: REGION,
			generation: 1,
			book: tagsBook,
			observation: baseObs
		})
		const initialTags = [['adbl_rec_tag_0-2-1', 'Witty', 'mood']]
		const seeded = await bookHistoryStore.persistObservation({
			asin: tagsAsin,
			region: REGION,
			generation: 2,
			book: {
				...tagsBook,
				tags: [{ tagId: 'adbl_rec_tag_0-2-1', name: 'Witty', type: 'mood' }]
			},
			observation: observation({
				title: 'Tags Base',
				imageId: IMG1,
				tags: initialTags
			})
		})
		expect(seeded.disposition).toBe('accepted')
		expect(seeded.modified).toBe(true)
		const stateAfterSeed = await collections()
			.collection('book_history_states')
			.findOne({ _id: tagsKey })
		expect(stateAfterSeed?.revision).toBe(0)
		const seededBaseline = (stateAfterSeed?.fields ?? []).find(
			(f: { field: string }) => f.field === 'tags'
		)
		expect(seededBaseline).toMatchObject({
			policy: 'tags:api:v1',
			value: { state: 'value', value: initialTags }
		})

		const changedTags = [
			['adbl_rec_tag_0-2-1', 'Witty', 'mood'],
			['adbl_rec_tag_0-2-2', 'Feel-Good', 'mood']
		]
		const result = await bookHistoryStore.persistObservation({
			asin: tagsAsin,
			region: REGION,
			generation: 3,
			book: {
				...tagsBook,
				tags: [
					{ tagId: 'adbl_rec_tag_0-2-2', name: 'Feel-Good', type: 'mood' },
					{ tagId: 'adbl_rec_tag_0-2-1', name: 'Witty', type: 'mood' }
				]
			},
			observation: observation({
				title: 'Tags Base',
				imageId: IMG1,
				tags: changedTags
			})
		})
		expect(result.disposition).toBe('accepted')
		expect(result.modified).toBe(true)

		const state = await collections().collection('book_history_states').findOne({ _id: tagsKey })
		expect(state?.revision).toBe(1)

		const revisions = await collections()
			.collection('book_history_revisions')
			.find({ asin: tagsAsin, region: REGION, revision: 1 })
			.toArray()
		expect(revisions).toHaveLength(1)
		expect(revisions[0].changedFields).toEqual(['tags'])
		expect(revisions[0].changes.tags.before).toEqual({ state: 'value', value: initialTags })
		expect(revisions[0].changes.tags.after).toEqual({ state: 'value', value: changedTags })

		const currentBook = await collections().collection('books').findOne({ asin: tagsAsin })
		expect(currentBook?.tags).toEqual([
			{ tagId: 'adbl_rec_tag_0-2-2', name: 'Feel-Good', type: 'mood' },
			{ tagId: 'adbl_rec_tag_0-2-1', name: 'Witty', type: 'mood' }
		])
		// The returned projection carries the tags too (optional in the
		// schema — a projection without them would still parse).
		expect(result.data?.tags).toEqual([
			{ tagId: 'adbl_rec_tag_0-2-2', name: 'Feel-Good', type: 'mood' },
			{ tagId: 'adbl_rec_tag_0-2-1', name: 'Witty', type: 'mood' }
		])
		// The persisted row is the public response contract: it must parse
		// against ApiBookSchema (an 11-char fixture ASIN would fail the 10-char
		// AsinSchema and would have masked this).
		expect(ApiBookSchema.safeParse(result.data).success).toBe(true)
	})

	test('an equal accepted observation bumps the watermark without a revision', async () => {
		const before = (await collections().collection('book_history_states').findOne({ _id: KEY }))
			?.revision
		const result = await bookHistoryStore.persistObservation(
			persistInput({
				generation: 3,
				book: book({
					title: 'Changed Title',
					genres: [{ type: 'genre', asin: '1234567890', name: 'Fiction' }]
				}),
				observation: observation({ title: 'Changed Title', imageId: IMG2 })
			})
		)
		expect(result.disposition).toBe('accepted')
		expect(result.modified).toBe(false)
		const after = (await collections().collection('book_history_states').findOne({ _id: KEY }))
			?.revision
		expect(after).toBe(before)
	})

	test('a stale generation makes no changes at all', async () => {
		const stateBefore = await collections().collection('book_history_states').findOne({ _id: KEY })
		const result = await bookHistoryStore.persistObservation(
			persistInput({
				generation: 1,
				book: book({ title: 'Stale Title' }),
				observation: observation({ title: 'Stale Title' })
			})
		)
		expect(result.disposition).toBe('stale')
		expect(result.modified).toBe(false)
		const stateAfter = await collections().collection('book_history_states').findOne({ _id: KEY })
		expect(stateAfter).toEqual(stateBefore)
		const current = await collections().collection('books').findOne({ asin: ASIN })
		expect(current?.title).toBe('Changed Title')
	})

	test('a concurrent state write conflicts with the repair fence (real write, not a no-op)', async () => {
		// Concurrency regression for the fence's $inc stateVersion: the
		// fence must be a REAL document modification. A no-op $set of the
		// read value establishes no write conflict, so a concurrent
		// watermark advance (an equal-projection acceptance in a newer
		// generation) could commit while the repair's fence still passes,
		// and the repair would commit stale ratings. With the $inc, the
		// two in-flight state writes to the same row conflict and the
		// repair's whole transaction — the books write included — aborts.
		const fenceAsin = 'B0FENCERE1'
		const key = `${REGION}:${fenceAsin}`
		const db2 = collections()
		await db2.collection('books').insertOne(book({ asin: fenceAsin, title: 'Fence Book' }) as never)
		await db2.collection('book_history_states').insertOne({
			_id: key,
			asin: fenceAsin,
			region: REGION,
			allocatedGeneration: 0,
			acceptedGeneration: 0,
			deleteFence: 0,
			revision: 0,
			assetSequence: 0,
			stateVersion: 0,
			established: true,
			legacyCaptured: true,
			fields: [],
			renditions: []
		} as never)
		const inserted = await db2.collection('books').findOne({ asin: fenceAsin })
		if (!inserted) throw new Error('fence row missing after insert')
		const bookId = inserted._id

		// An uncommitted watermark advance on the state row (the
		// equal-projection acceptance in flight) holds a write claim on the
		// document: the repair's fence write must block on it. The contender
		// commits mid-flight, so the repair's fence write fails with a write
		// conflict, the transaction retries on a fresh snapshot, and the
		// advanced watermark makes the fence match 0: the repair is
		// superseded, and the books write never commits. (With a no-op
		// fence update the conflict semantics are what make the fence a
		// real write; the assertion below is that NO ratings land.)
		const contender = await client?.startSession()
		if (!contender) throw new Error('no contender session')
		contender.startTransaction()
		try {
			await db2
				.collection('book_history_states')
				.updateOne({ _id: key }, { $set: { acceptedGeneration: 2 } }, { session: contender })
			// Deterministic commit order: the contender's write is
			// uncommitted, so the repair's fence $inc BLOCKS on it — the
			// repair is observable in `currentOp` as an active command
			// from a DIFFERENT session (its `lsid`) only while that claim
			// is held. Committing exactly when the repair's blocked fence
			// write appears is what makes the conflict real: the fence
			// write fails with a write conflict, the transaction retries on
			// a fresh snapshot, and the advanced watermark makes the fence
			// match 0: `superseded`.
			const admin = client?.db('admin')
			if (!admin) throw new Error('no admin db for currentOp')
			// BSON session IDs stringify as '[object Object]' — compare
			// canonical JSON, not String().
			const contenderSession = JSON.stringify(contender.id?.id)
			const repair = bookHistoryStore.persistRatingsRepair({
				asin: fenceAsin,
				region: REGION,
				generation: 1,
				bookId,
				ratings: { value: '4.0', numRatings: 10, numReviews: 1 } as never
			})
			// Settlement is tracked as a FLAG, never awaited inside the
			// poll: the repair is blocked on the contender's uncommitted
			// claim (released only AFTER the loop), so awaiting its
			// settlement promise would block the poll until the deadline,
			// and a promise that resolves `true` on either outcome would
			// exit the loop on the first settled microtask.
			let repairSettled = false
			repair.then(
				() => {
					repairSettled = true
				},
				() => {
					repairSettled = true
				}
			)
			// Bounded, deterministic sync on the ACTUAL fence write: poll
			// `currentOp` for the repair's blocked command (an `update`
			// from a session that is not the contender's), or stop once the
			// repair has already settled. A fixed delay cannot order the
			// commit after the blocked fence write (the repair may already
			// be done by then, passing via the no-conflict superseded
			// path), and an unbounded poll would strand the suite if the
			// write never blocks.
			const BOUND_MS = 15000
			const deadline = Date.now() + BOUND_MS
			let sawBlockedFence = false
			while (Date.now() < deadline) {
				if (repairSettled) break
				const ops = await admin.command({ currentOp: 1, secs_running: 0 })
				// `currentOp` reports active operations under `inprog` (not
				// `inprogress`). The repair's fence write is an `update` command
				// on the `book_history_states` collection; match on the
				// namespace and exclude the contender's own session (its write
				// is the one being blocked, not the repair's).
				const inprog = (ops.inprog ?? []) as Array<{
					op?: string
					ns?: string
					lsid?: { id?: unknown }
				}>
				if (
					inprog.some(
						(op) =>
							op.op === 'update' &&
							typeof op.ns === 'string' &&
							op.ns.endsWith('book_history_states') &&
							JSON.stringify(op.lsid?.id) !== contenderSession
					)
				) {
					sawBlockedFence = true
					break
				}
				// Poll pacing only; the observed condition is the repair's
				// blocked fence write (real-server state, not a clock).
				await Bun.sleep(25)
			}
			// Committing the contender now: if the repair's fence write is
			// blocked on it, the contender's commit releases the claim and
			// the repair's transaction hits a write conflict; if the repair
			// already settled (no conflict), the advanced watermark still
			// makes the fence match 0 → `superseded`.
			try {
				await contender.commitTransaction()
			} catch {
				// the repair committed first and the contender was
				// already committed/aborted by the finally below
			}
			const result = await repair
			expect(result).toEqual({ modified: 0, superseded: true })
			// The bounded sync must have observed the real blocked fence
			// write: a test that "passed" without it would not have
			// exercised the conflict path.
			expect(sawBlockedFence).toBe(true)
		} finally {
			// The contender is committed (or already aborted after a
			// timeout): a second abort would throw.
			try {
				await contender.abortTransaction()
			} catch {
				// already committed/aborted
			}
			await contender.endSession()
		}
		// The repair superseded: no ratings were written to the book row.
		const after = await db2.collection('books').findOne({ _id: bookId })
		expect(after?.ratings).toBeUndefined()
	}, 60000)

	test('the genre-preserving merge keeps stored genres when the observation empties them', async () => {
		// An observation with no genre evidence (ladder-less fetches) is not
		// a removal: the stored genres are spliced into the write document
		// before the equality check and the $set, so the accepted update
		// lands with the other changed fields while the stored list survives.
		await bookHistoryStore.persistObservation(
			persistInput({
				generation: 4,
				book: book({ title: 'Genres Book' }),
				observation: observation({ title: 'Genres Book', imageId: IMG2 })
			})
		)
		const accepted = await bookHistoryStore.persistObservation(
			persistInput({
				generation: 5,
				// `genres: []` is NO genre evidence (`!normBook.genres?.length`
				// matches the missing-key form), so the merge condition fires
				// even though the fixture helper defaults genres on.
				book: book({ title: 'Genres Stripped', genres: [] }),
				observation: observation({ title: 'Genres Stripped', imageId: IMG2 })
			})
		)
		expect(accepted.disposition).toBe('accepted')
		expect(accepted.modified).toBe(true)
		const current = await collections().collection('books').findOne({ asin: ASIN })
		expect(current?.title).toBe('Genres Stripped')
		expect(current?.genres).toEqual(GENRES)
	})

	test('a genre-less equal observation short-circuits past reordered stored genre keys', async () => {
		// R3 regression: the merge splices the RAW stored genres into the
		// parsed write document. A stored genre object whose key order
		// differs from the Zod projection (e.g. { name, type, asin }) never
		// compares equal under a stringify-based comparison, so the
		// short-circuit must re-parse the merged document through
		// ApiBookSchema before comparing — otherwise every genre-less
		// no-op observation rewrites the whole row.
		const reorderAsin = 'B0GENRORD1'
		const db3 = collections()
		const gen1 = await bookHistoryStore.reserveGeneration(reorderAsin, REGION)
		await bookHistoryStore.persistObservation(
			persistInput({
				asin: reorderAsin,
				generation: gen1,
				book: book({ asin: reorderAsin, title: 'Reorder Book' }),
				observation: observation({ title: 'Reorder Book', imageId: IMG1 })
			})
		)
		// Rewrite the stored genre object with a non-declaration key order,
		// simulating a pre-projection row (raw driver writes bypass the
		// papr validator, like the legacy rows that predate it).
		await db3
			.collection('books')
			.updateOne(
				{ asin: reorderAsin },
				{ $set: { 'genres.0': { name: 'Fiction', type: 'genre', asin: '1234567890' } } }
			)
		const stateBefore = await db3
			.collection('book_history_states')
			.findOne({ _id: `${REGION}:${reorderAsin}` })
		const currentBefore = await db3.collection('books').findOne({ asin: reorderAsin })
		const gen2 = await bookHistoryStore.reserveGeneration(reorderAsin, REGION)
		const result = await bookHistoryStore.persistObservation({
			asin: reorderAsin,
			region: REGION,
			generation: gen2,
			book: book({ asin: reorderAsin, title: 'Reorder Book', genres: [] }),
			observation: observation({ title: 'Reorder Book', imageId: IMG1 })
		})
		expect(result.disposition).toBe('accepted')
		// Equal short-circuit: the row is not rewritten, no revision, no
		// new history entry, the stored genre data survives untouched.
		expect(result.modified).toBe(false)
		const stateAfter = await db3
			.collection('book_history_states')
			.findOne({ _id: `${REGION}:${reorderAsin}` })
		expect(stateAfter?.revision).toBe(stateBefore?.revision)
		expect(stateAfter?.assetSequence).toBe(stateBefore?.assetSequence)
		expect(
			await db3
				.collection('book_history_revisions')
				.countDocuments({ asin: reorderAsin, region: REGION })
		).toBe(0)
		const current = await db3.collection('books').findOne({ asin: reorderAsin })
		expect(current?.updatedAt).toEqual(currentBefore?.updatedAt)
		expect(current?.genres).toEqual([{ asin: '1234567890', name: 'Fiction', type: 'genre' }])
	}, 30000)

	test('a first-touch acceptance with a genre-less incoming continues at sequence 2', async () => {
		// First-touch legacy capture runs inside the same transaction as the
		// first accepted observation: the captured asset advances the
		// assetSequence to 1, so the next accepted observation must continue
		// at sequence 2 and not re-insert at 1 (artwork_order unique index).
		// The incoming book is genre-less (no genre key); the stored row
		// carries genres, so the genre-preserving merge applies and the
		// first observation is ACCEPTED — not rejected — the changed field
		// persists with the stored genres intact.
		const seqAsin = 'B0GENRSEQ1'
		const db2 = collections()
		await db2.collection('books').insertOne({
			...book({ asin: seqAsin, title: 'Seq Book' })
		} as never)
		// The real precondition: reserveGeneration inserts the fresh
		// (unestablished, legacyCaptured=false, assetSequence=0) state before
		// any observation is persisted.
		await bookHistoryStore.reserveGeneration(seqAsin, REGION)

		// The FIRST observation is genre-less too: only then does the
		// genre-preserving merge (stored genres spliced into a
		// genre-evidence-free write) run on the first-touch acceptance,
		// which is the stated regression.
		const first = await bookHistoryStore.persistObservation({
			asin: seqAsin,
			region: REGION,
			generation: 1,
			book: book({ asin: seqAsin, title: 'Seq Book', genres: [] }),
			observation: observation({ title: 'Seq Book', imageId: IMG1 })
		})
		expect(first.disposition).toBe('accepted')
		expect(first.modified).toBe(false)
		// The first-touch capture archived the stored image at sequence 1 and
		// the acceptance persisted the legacyCaptured watermark in-transaction;
		// the genre-less observation's write kept the stored genre list.
		const legacy = await db2
			.collection('book_artwork')
			.findOne({ asin: seqAsin, region: REGION, legacy: { $ne: null } })
		expect(legacy?.sequence).toBe(1)
		const currentAfterFirst = await db2.collection('books').findOne({ asin: seqAsin })
		expect(currentAfterFirst?.genres).toEqual(GENRES)
		const stateAfterFirst = await db2
			.collection('book_history_states')
			.findOne({ _id: `${REGION}:${seqAsin}` })
		expect(stateAfterFirst?.legacyCaptured).toBe(true)
		expect(stateAfterFirst?.assetSequence).toBe(1)

		// The next accepted observation continues at sequence 2.
		const accepted = await bookHistoryStore.persistObservation({
			asin: seqAsin,
			region: REGION,
			generation: 2,
			// `genres: []` = no genre evidence: the merge must apply to this
			// changed follow-up (stored row carries genres) for the stated
			// regression to be exercised.
			book: book({ asin: seqAsin, title: 'Seq Book Changed', genres: [] }),
			observation: observation({ title: 'Seq Book Changed', imageId: IMG2 })
		})
		expect(accepted.disposition).toBe('accepted')
		const stateAfterAccept = await db2
			.collection('book_history_states')
			.findOne({ _id: `${REGION}:${seqAsin}` })
		expect(stateAfterAccept?.assetSequence).toBe(2)
	}, 30000)

	test('a genre-less first observation with no state row is accepted and establishes state', async () => {
		// Contract flip (merged-projection safeguard): the old test pinned a
		// defensive `History state missing` throw for a genre-rejected first
		// observation with no state doc. With the safeguard now run against
		// the MERGED projection (the stored genres applied to a genre-less
		// incoming book), the guard passes whenever a trusted row exists —
		// even one with no state row — so the first observation is ACCEPTED
		// and establishes the fresh state, instead of reaching the now-
		// unreachable defensive throw.
		const freshAsin = 'B0GENRSEQ2'
		const db2 = collections()
		await db2.collection('books').insertOne({
			...book({ asin: freshAsin, title: 'Guard Book' })
		} as never)
		const accepted = await bookHistoryStore.persistObservation({
			asin: freshAsin,
			region: REGION,
			generation: 1,
			book: book({ asin: freshAsin, title: 'Guard Book Changed', genres: [] }),
			observation: observation({ title: 'Guard Book Changed', imageId: IMG1 })
		})
		expect(accepted.disposition).toBe('accepted')
		const current = await db2.collection('books').findOne({ asin: freshAsin })
		expect(current?.title).toBe('Guard Book Changed')
		expect(current?.genres).toEqual(GENRES)
		const stateAfter = await db2
			.collection('book_history_states')
			.findOne({ _id: `${REGION}:${freshAsin}` })
		expect(stateAfter?.established).toBe(true)
		expect(stateAfter?.legacyCaptured).toBe(true)
	}, 30000)

	test('deleteCurrent keeps history and re-creation triggers legacy capture', async () => {
		const stateBefore = await collections().collection('book_history_states').findOne({ _id: KEY })
		const revisionsBefore = await collections()
			.collection('book_history_revisions')
			.countDocuments({ asin: ASIN, region: REGION })
		const assetsBefore = await collections()
			.collection('book_artwork')
			.countDocuments({ asin: ASIN, region: REGION })

		const result = await bookHistoryStore.deleteCurrent(ASIN, REGION)
		expect(result.modified).toBe(true)
		const current = await collections().collection('books').findOne({ asin: ASIN })
		expect(current).toBeNull()

		const stateAfter = await collections().collection('book_history_states').findOne({ _id: KEY })
		expect(stateAfter?.established).toBe(true)
		expect(stateAfter?.acceptedGeneration).toBe(stateBefore?.acceptedGeneration)
		expect(stateAfter?.deleteFence).toBeGreaterThanOrEqual(stateBefore?.deleteFence)

		// Re-create at a fresh generation.
		const reCreate = await bookHistoryStore.persistObservation(
			persistInput({
				generation: 10,
				book: book({ title: 'Recreated' }),
				observation: observation({ title: 'Recreated', imageId: IMG2 })
			})
		)
		expect(reCreate.disposition).not.toBe('stale')
		const stateFinal = await collections().collection('book_history_states').findOne({ _id: KEY })
		expect(stateFinal?.legacyCaptured).toBe(true)

		const revisions = await collections()
			.collection('book_history_revisions')
			.countDocuments({ asin: ASIN, region: REGION })
		const legacyArtwork = await collections()
			.collection('book_artwork')
			.findOne({ asin: ASIN, region: REGION, legacy: { $ne: null } })
		expect(legacyArtwork?.legacy?.storedUrl).toContain('.jpg')
		expect(assetsBefore).toBeGreaterThanOrEqual(1)

		// The re-created book differs from the surviving baselines
		// (title/artwork), so it is a genuine changed write: exactly one
		// more revision than existed before the delete.
		expect(revisions).toBe(revisionsBefore + 1)
	})

	test('legacy capture on first touch does not collide with the next asset sequence', async () => {
		// F1 regression: an established legacy row (no state) has its image
		// archived at sequence 1 on first touch; the new observation's
		// assets must continue at sequence 2, not reuse 1.
		const legacyAsin = 'B0LEGACY01'
		const db2 = collections()
		// Simulate retained partial metadata, while preserving the stored dates
		// that an accepted refresh must retain (ApiBook normalization omits them).
		await db2.collection('books').insertOne(
			{
				asin: legacyAsin,
				region: REGION,
				title: 'Legacy Row',
				createdAt: new Date('2020-01-01T00:00:00.000Z'),
				updatedAt: new Date('2020-01-01T00:00:00.000Z'),
				image: `https://m.media-amazon.com/images/I/${IMG1}.jpg`
			} as never,
			{ bypassDocumentValidation: true }
		)
		const result = await bookHistoryStore.persistObservation({
			asin: legacyAsin,
			region: REGION,
			generation: 1,
			book: book({ asin: legacyAsin, title: 'Legacy Row' }),
			observation: observation({
				title: 'Legacy Row',
				imageId: IMG2,
				imageUrl: `https://m.media-amazon.com/images/I/${IMG2}.jpg`
			})
		})
		expect(result.disposition).toBe('accepted')
		const sequences = (
			await db2
				.collection('book_artwork')
				.find({ asin: legacyAsin, region: REGION })
				.project({ sequence: 1 })
				.sort({ sequence: 1 })
				.toArray()
		).map((doc) => doc.sequence)
		expect(sequences).toEqual([1, 2])
		const state = await db2.collection('book_history_states').findOne({
			_id: `${REGION}:${legacyAsin}`
		})
		expect(state?.assetSequence).toBe(2)
	}, 30000)

	test('deleteCurrent on a string-_id trusted row retains the image as an identity exception', async () => {
		// F1 regression: a trusted current row whose `_id` is not an ObjectId
		// (audit/seed `unsupported_id`) cannot fill the ObjectId-typed
		// `legacy.sourceBookId`; captureLegacy records the stored URL as an
		// identity exception and skips the typed legacy asset, so the delete
		// loses no image.
		const stringId = 'audit-string-id-1'
		const db2 = collections()
		// This retained legacy identity is intentionally incompatible with the
		// current ObjectId validator; only its fixture insertion bypasses it.
		await db2.collection('books').insertOne(
			{
				_id: stringId,
				asin: 'B0NONOID01',
				region: REGION,
				title: 'String Id Row',
				image: `https://m.media-amazon.com/images/I/${IMG1}.jpg`
			} as never,
			{ bypassDocumentValidation: true }
		)
		const result = await bookHistoryStore.deleteCurrent('B0NONOID01', REGION)
		expect(result.modified).toBe(true)
		expect(await db2.collection('books').findOne({ asin: 'B0NONOID01' })).toBeNull()
		const exception = await db2
			.collection('book_history_identity_exceptions')
			.findOne({ _id: `B0NONOID01::value::${REGION}::string:${stringId}` })
		expect(exception?.storedUrl).toBe(`https://m.media-amazon.com/images/I/${IMG1}.jpg`)
		expect(exception?.reasons).toEqual(['unsupported_id'])
		expect(exception?.region).toEqual({ state: 'value', value: REGION })
		// No typed legacy asset was inserted for the non-ObjectId row.
		expect(
			await db2.collection('book_artwork').countDocuments({ asin: 'B0NONOID01', region: REGION })
		).toBe(0)
		// The delete watermark is still applied.
		const state = await db2
			.collection('book_history_states')
			.findOne({ _id: `${REGION}:B0NONOID01` })
		expect(state?.legacyCaptured).toBe(true)
		expect(state?.assetSequence).toBe(0)
	}, 30000)

	test('an equal observation on a seeded empty-baseline book initializes baselines', async () => {
		// F2 regression: an established state with no baselines (seed
		// outcome) must be initialized from the next accepted — equal —
		// observation, and a restricted rendition transition on an equal
		// public projection still produces a revision.
		const seedAsin = 'B0SEEDEQ01'
		const db2 = collections()
		// A full valid book row (the `book()` fixture) so `toApiBook(currentBook)`
		// is non-null and `deepEqualBook` matches — this is what makes the
		// `currentBook && oldApi` equal short-circuit branch run (the F2
		// regression). A partial row would fail `ApiBookSchema` and skip it.
		await db2.collection('books').insertOne(book({ asin: seedAsin, title: 'Seeded Book' }) as never)
		// Seed-like established state with empty baselines.
		await db2.collection('book_history_states').insertOne({
			_id: `${REGION}:${seedAsin}`,
			asin: seedAsin,
			region: REGION,
			allocatedGeneration: 0,
			acceptedGeneration: 0,
			deleteFence: 0,
			revision: 0,
			assetSequence: 1,
			stateVersion: 1,
			established: true,
			legacyCaptured: true,
			fields: [],
			renditions: []
		} as never)
		await db2.collection('book_artwork').insertOne({
			asin: seedAsin,
			region: REGION,
			sequence: 1,
			imageId: IMG1,
			legacy: {
				sourceBookId: new ObjectId(),
				storedUrl: `https://m.media-amazon.com/images/I/${IMG1}.jpg`,
				importedAt: new Date('2026-01-01T00:00:00.000Z')
			},
			renditions: []
		} as never)
		const result = await bookHistoryStore.persistObservation({
			asin: seedAsin,
			region: REGION,
			generation: 1,
			book: book({ asin: seedAsin, title: 'Seeded Book' }),
			observation: observation({
				title: 'Seeded Book',
				imageId: IMG2,
				imageUrl: `https://m.media-amazon.com/images/I/${IMG2}.jpg`
			})
		})
		expect(result.disposition).toBe('accepted')
		// The equal short-circuit branch ran (a differing public projection would
		// take the accepted-write path and return `modified: true`).
		expect(result.modified).toBe(false)
		const state = await db2.collection('book_history_states').findOne({
			_id: `${REGION}:${seedAsin}`
		})
		expect(state?.fields.length).toBe(1)
		expect((state?.renditions as Array<{ imageId: string }>)?.[0]?.imageId).toBe(IMG2)
		// The seeded state had no baselines, so the equal observation
		// initializes them quietly — no revision document.
		expect(state?.revision).toBe(0)
		expect(
			await db2.collection('book_history_revisions').countDocuments({
				asin: seedAsin,
				region: REGION
			})
		).toBe(0)
		// The initialization stamp is recorded.
		expect(state?.startedAt).toBeInstanceOf(Date)
	}, 30000)

	test('a non-trusted current row produces a conflict, not an acceptance', async () => {
		// F6 regression: a row whose region is null/unsupported is a
		// competitor; the exact row is not trusted while it exists.
		const conflictAsin = 'B0CONFLICT1'
		const db2 = collections()
		const seeded = (await db2.collection('book_history_states').findOne({
			_id: `${REGION}:${conflictAsin}`
		})) as { acceptedGeneration: number } | null
		expect(seeded).toBeNull()
		const stateId = `${REGION}:${conflictAsin}`
		await expect(
			bookHistoryStore.persistObservation({
				asin: conflictAsin,
				region: REGION,
				generation: 1,
				book: book({ asin: conflictAsin }),
				observation: observation()
			})
		).resolves.toMatchObject({ disposition: 'accepted' })
		// Now add a null-region competitor for the same identity.
		const rows = await db2.collection('books').find({ asin: conflictAsin }).toArray()
		expect(rows).toHaveLength(1)
		// Reproduce retained legacy null-region data without weakening the validator.
		await db2
			.collection('books')
			.updateOne(
				{ _id: rows[0]._id },
				{ $set: { region: null } },
				{ bypassDocumentValidation: true }
			)
		await expect(
			bookHistoryStore.persistObservation({
				asin: conflictAsin,
				region: REGION,
				generation: 2,
				book: book({ asin: conflictAsin }),
				observation: observation()
			})
		).rejects.toThrow('identity conflict')
		// The first (pre-competitor) acceptance stands; the rejected run
		// consumed no generation.
		await expect(
			db2.collection('book_history_states').findOne({ _id: stateId })
		).resolves.toMatchObject({ acceptedGeneration: 1 })
	}, 30000)

	test('an exact row with a region-less competitor conflicts without a duplicate insert', async () => {
		// Predicate regression: `exactCount === 1 && competitorCount === 1`
		// must reject as an identity conflict; the old predicate only
		// rejected `exactCount > 1` and fell through to a duplicate insert.
		const conflictAsin = 'B0CONFLICT2'
		const db2 = collections()
		const stateId = `${REGION}:${conflictAsin}`
		await db2.collection('books').insertOne(
			book({
				asin: conflictAsin,
				title: 'Exact Row',
				image: `https://m.media-amazon.com/images/I/${IMG1}.jpg`
			}) as never
		)
		// The null-region competitor represents an invalid retained legacy
		// document; the normal exact-region fixture above is fully validated.
		await db2.collection('books').insertOne(
			book({
				asin: conflictAsin,
				region: null,
				title: 'Regionless Row',
				image: `https://m.media-amazon.com/images/I/${IMG2}.jpg`
			}) as never,
			{ bypassDocumentValidation: true }
		)
		await expect(
			bookHistoryStore.persistObservation({
				asin: conflictAsin,
				region: REGION,
				generation: 1,
				book: book({ asin: conflictAsin }),
				observation: observation()
			})
		).rejects.toThrow('identity conflict')
		// The conflict path writes no row: both pre-seeded rows remain and
		// no second/duplicate row was written.
		const rows = await db2
			.collection('books')
			.find({ asin: conflictAsin })
			.sort({ _id: 1 })
			.toArray()
		expect(rows).toHaveLength(2)
		expect(rows.map((row) => row.region).sort()).toEqual([null, REGION])
		// No state was established by the rejected run either.
		expect(await db2.collection('book_history_states').findOne({ _id: stateId })).toBeNull()
	}, 30000)

	test('unparsed artwork references are retained without an image ID', async () => {
		const result = await bookHistoryStore.persistObservation(
			persistInput({
				generation: 20,
				book: book({ title: 'Unparsed Artwork Book' }),
				observation: observation({
					title: 'Unparsed Artwork Book',
					imageId: null,
					imageUrl: 'https://rawpics.example/cover/1234.jpg'
				})
			})
		)
		expect(result.disposition).toBe('accepted')
		const unparsed = await collections()
			.collection('book_artwork')
			.findOne({
				asin: ASIN,
				region: REGION,
				imageId: { $exists: false },
				unparsedKey: { $type: 'string' }
			})
		expect(unparsed?._id).toBeInstanceOf(ObjectId)
	})

	test('a malformed stored value envelope is a server fault, not a silent comparison input', async () => {
		// Baselines are decoded through `HistoryValueSchema` at the read
		// boundary (decodeBaselines): a bare `{ state: 'web' }` stub is an
		// invalid envelope. The persist must reject with a Zod fault before
		// any comparison — never comparing against the malformed baseline
		// and never writing on top of it.
		const malformedAsin = 'B0MALFORMD'
		const db2 = collections()
		await db2
			.collection('books')
			.insertOne(book({ asin: malformedAsin, title: 'Malformed Book' }) as never)
		await db2.collection('book_history_states').insertOne({
			_id: `${REGION}:${malformedAsin}`,
			asin: malformedAsin,
			region: REGION,
			allocatedGeneration: 0,
			acceptedGeneration: 0,
			deleteFence: 0,
			revision: 0,
			assetSequence: 0,
			stateVersion: 1,
			established: true,
			legacyCaptured: true,
			fields: [
				{
					field: 'title',
					policy: 'editorial:title:v1',
					value: { state: 'web' },
					baselineAt: new Date('2026-01-01T00:00:00.000Z')
				}
			],
			renditions: []
		} as never)
		await expect(
			bookHistoryStore.persistObservation({
				asin: malformedAsin,
				region: REGION,
				generation: 1,
				book: book({ asin: malformedAsin, title: 'Malformed Book' }),
				observation: observation({ title: 'Malformed Book', imageId: IMG2 })
			})
		).rejects.toThrow()
		// The fault aborts the transaction before any write: the current
		// row and the malformed state survive untouched.
		const current = await db2.collection('books').findOne({ asin: malformedAsin })
		expect(current?.title).toBe('Malformed Book')
		const state = await db2
			.collection('book_history_states')
			.findOne({ _id: `${REGION}:${malformedAsin}` })
		expect(state?.fields[0].value).toEqual({ state: 'web' })
	}, 30000)

	test('unknown series evidence preserves the stored series; removal evidence $unsets and records the delta', async () => {
		// Two cases in one scenario: (1) an accepted book whose observation
		// carries NO series evidence (unknown, not absent) must preserve the
		// stored series — the comparison contract retains unknown evidence,
		// so the row and the returned projection keep the keys; (2) an
		// accepted book whose observation declares the series keys ABSENT
		// (explicit removal) must $unset them from the row so the row and
		// the baselines stay in step, and record the series delta.
		const seriesAsin = 'B0SERIEST1'
		const db2 = collections()
		const seriesPrimary = { asin: 'B0SERIES1', name: 'Series One', position: '1' }
		const seriesSecondary = { asin: 'B0SERIES2', name: 'Spinoff', position: '2' }
		await db2
			.collection('books')
			.insertOne(
				book({ asin: seriesAsin, title: 'Series Book', seriesPrimary, seriesSecondary }) as never
			)
		await db2.collection('book_history_states').insertOne({
			_id: `${REGION}:${seriesAsin}`,
			asin: seriesAsin,
			region: REGION,
			allocatedGeneration: 0,
			acceptedGeneration: 0,
			deleteFence: 0,
			revision: 0,
			assetSequence: 1,
			stateVersion: 1,
			established: true,
			legacyCaptured: true,
			fields: [
				{
					field: 'seriesPrimary',
					policy: 'editorial:seriesPrimary:v1',
					value: { state: 'value', value: seriesPrimary },
					baselineAt: new Date('2026-01-01T00:00:00.000Z')
				},
				{
					field: 'seriesSecondary',
					policy: 'editorial:seriesSecondary:v1',
					value: { state: 'value', value: seriesSecondary },
					baselineAt: new Date('2026-01-01T00:00:00.000Z')
				}
			],
			renditions: []
		} as never)
		// The seeded legacy asset keeps assetSequence honest across the run.
		await db2.collection('book_artwork').insertOne({
			asin: seriesAsin,
			region: REGION,
			sequence: 1,
			imageId: IMG1,
			legacy: {
				sourceBookId: new ObjectId(),
				storedUrl: `https://m.media-amazon.com/images/I/${IMG1}.jpg`,
				importedAt: new Date('2026-01-01T00:00:00.000Z')
			},
			renditions: []
		} as never)
		// Phase 1: no series evidence in the observation (unknown, not
		// absent) — the stored row keeps its series keys (the comparison
		// contract retains unknown evidence), the returned/cached projection
		// reflects them, and the baselines + revision counter stay untouched
		// (unknown evidence retains, never compares).
		const first = await bookHistoryStore.persistObservation({
			asin: seriesAsin,
			region: REGION,
			generation: 1,
			book: book({ asin: seriesAsin, title: 'Series Book' }),
			observation: observation({
				title: 'Series Book',
				imageId: IMG1,
				imageUrl: `https://m.media-amazon.com/images/I/${IMG1}.jpg`
			})
		})
		expect(first.disposition).toBe('accepted')
		const rowAfterFirst = await db2.collection('books').findOne({ asin: seriesAsin })
		expect(rowAfterFirst).toHaveProperty('seriesPrimary', seriesPrimary)
		expect(rowAfterFirst).toHaveProperty('seriesSecondary', seriesSecondary)
		// The accepted observation's returned projection preserves the
		// stored series (the API serves the series the row still carries).
		expect(first.data.seriesPrimary).toEqual(seriesPrimary)
		expect(first.data.seriesSecondary).toEqual(seriesSecondary)
		const stateAfterFirst = await db2
			.collection('book_history_states')
			.findOne({ _id: `${REGION}:${seriesAsin}` })
		expect(stateAfterFirst?.revision).toBe(0)
		const firstByField = new Map(
			(stateAfterFirst?.fields ?? []).map((f: { field: string; value: unknown }) => [
				f.field,
				f.value
			])
		)
		expect(firstByField.get('seriesPrimary')).toEqual({
			state: 'value',
			value: seriesPrimary
		})
		expect(firstByField.get('seriesSecondary')).toEqual({
			state: 'value',
			value: seriesSecondary
		})

		// Phase 2: the observation declares the series keys as explicitly
		// empty (the `series: []` outcome → `state: 'absent'` envelopes):
		// the baselines advance to ABSENT and the transition is recorded.
		const seriesObservation = observation({
			title: 'Series Book',
			imageId: IMG1,
			imageUrl: `https://m.media-amazon.com/images/I/${IMG1}.jpg`
		})
		seriesObservation.fields.push(
			{
				field: 'seriesPrimary',
				policy: 'editorial:seriesPrimary:v1',
				value: { state: 'absent' },
				source: 'audible_api'
			},
			{
				field: 'seriesSecondary',
				policy: 'editorial:seriesSecondary:v1',
				value: { state: 'absent' },
				source: 'audible_api'
			}
		)
		const result = await bookHistoryStore.persistObservation({
			asin: seriesAsin,
			region: REGION,
			generation: 2,
			book: book({ asin: seriesAsin, title: 'Series Book' }),
			observation: seriesObservation
		})
		expect(result.disposition).toBe('accepted')
		// Phase 1 preserved the stored series, so the declared-absent
		// observation is a real change: the row $unsets the series, the
		// baselines advance to ABSENT, and a revision records the delta.
		expect(result.modified).toBe(true)
		// The returned/cached projection reflects the removal: the series
		// keys are gone from the accepted projection.
		expect(result.data.seriesPrimary).toBeUndefined()
		expect(result.data.seriesSecondary).toBeUndefined()

		// Both series keys are removed from the stored row, the rest stands.
		const current = await db2.collection('books').findOne({ asin: seriesAsin })
		expect(current).not.toHaveProperty('seriesPrimary')
		expect(current).not.toHaveProperty('seriesSecondary')
		expect(current?.title).toBe('Series Book')

		// The baselines advanced to ABSENT (an explicit source declaration).
		const state = await db2
			.collection('book_history_states')
			.findOne({ _id: `${REGION}:${seriesAsin}` })
		const byField = new Map(
			(state?.fields ?? []).map((f: { field: string; value: unknown }) => [f.field, f.value])
		)
		expect(byField.get('seriesPrimary')).toEqual({ state: 'absent' })
		expect(byField.get('seriesSecondary')).toEqual({ state: 'absent' })
		expect(state?.revision).toBe(1)

		// The revision records exactly the two series transitions.
		const revisions = await db2
			.collection('book_history_revisions')
			.find({ asin: seriesAsin, region: REGION, revision: 1 })
			.toArray()
		expect(revisions).toHaveLength(1)
		expect(revisions[0].changedFields.slice().sort()).toEqual(['seriesPrimary', 'seriesSecondary'])
		expect(revisions[0].changes.seriesPrimary.before).toEqual({
			state: 'value',
			value: seriesPrimary
		})
		expect(revisions[0].changes.seriesPrimary.after).toEqual({ state: 'absent' })
	}, 30000)

	test('mixed series evidence retains the value-declared series and $unsets only the absent one', async () => {
		// The mixed state the other two phases never cover: an accepted
		// observation that keeps a selected `seriesPrimary` (value envelope
		// present) while declaring `seriesSecondary` ABSENT. Per the
		// F1/F6 contract the stored row RETAINS `seriesPrimary` and $unsets
		// only `seriesSecondary`; the revision records exactly that delta.
		const mixedAsin = 'B0SERIEST2'
		const db2 = collections()
		const seriesPrimary = { asin: 'B0SERIES1', name: 'Series One', position: '1' }
		const seriesSecondary = { asin: 'B0SERIES2', name: 'Spinoff', position: '2' }
		await db2.collection('books').insertOne(
			book({
				asin: mixedAsin,
				title: 'Mixed Series Book',
				seriesPrimary,
				seriesSecondary
			}) as never
		)
		await db2.collection('book_history_states').insertOne({
			_id: `${REGION}:${mixedAsin}`,
			asin: mixedAsin,
			region: REGION,
			allocatedGeneration: 0,
			acceptedGeneration: 0,
			deleteFence: 0,
			revision: 0,
			assetSequence: 1,
			stateVersion: 1,
			established: true,
			legacyCaptured: true,
			fields: [
				{
					field: 'seriesPrimary',
					policy: 'editorial:seriesPrimary:v1',
					value: { state: 'value', value: seriesPrimary },
					baselineAt: new Date('2026-01-01T00:00:00.000Z')
				},
				{
					field: 'seriesSecondary',
					policy: 'editorial:seriesSecondary:v1',
					value: { state: 'value', value: seriesSecondary },
					baselineAt: new Date('2026-01-01T00:00:00.000Z')
				}
			],
			renditions: []
		} as never)
		// The seeded legacy asset keeps assetSequence honest across the run.
		await db2.collection('book_artwork').insertOne({
			asin: mixedAsin,
			region: REGION,
			sequence: 1,
			imageId: IMG1,
			legacy: {
				sourceBookId: new ObjectId(),
				storedUrl: `https://m.media-amazon.com/images/I/${IMG1}.jpg`,
				importedAt: new Date('2026-01-01T00:00:00.000Z')
			},
			renditions: []
		} as never)

		// The observation keeps `seriesPrimary` (value envelope present) and
		// declares `seriesSecondary` ABSENT (explicit removal).
		const mixedObservation = observation({
			title: 'Mixed Series Book',
			imageId: IMG1,
			imageUrl: `https://m.media-amazon.com/images/I/${IMG1}.jpg`
		})
		mixedObservation.fields.push(
			{
				field: 'seriesPrimary',
				policy: 'editorial:seriesPrimary:v1',
				value: { state: 'value', value: seriesPrimary },
				source: 'audible_api'
			},
			{
				field: 'seriesSecondary',
				policy: 'editorial:seriesSecondary:v1',
				value: { state: 'absent' },
				source: 'audible_api'
			}
		)
		const result = await bookHistoryStore.persistObservation({
			asin: mixedAsin,
			region: REGION,
			generation: 1,
			book: book({ asin: mixedAsin, title: 'Mixed Series Book' }),
			observation: mixedObservation
		})
		expect(result.disposition).toBe('accepted')
		// The declared-absent seriesSecondary is a real change.
		expect(result.modified).toBe(true)
		// The returned/cached projection keeps the retained series and
		// drops the removed one.
		expect(result.data.seriesPrimary).toEqual(seriesPrimary)
		expect(result.data.seriesSecondary).toBeUndefined()

		// The stored row RETAINS seriesPrimary and $unsets only
		// seriesSecondary — the mixed case $unset gating.
		const current = await db2.collection('books').findOne({ asin: mixedAsin })
		expect(current).toHaveProperty('seriesPrimary', seriesPrimary)
		expect(current).not.toHaveProperty('seriesSecondary')
		expect(current?.title).toBe('Mixed Series Book')

		// Baselines: seriesPrimary unchanged (same value), seriesSecondary
		// advanced to ABSENT; exactly one revision counter step.
		const state = await db2
			.collection('book_history_states')
			.findOne({ _id: `${REGION}:${mixedAsin}` })
		const byField = new Map(
			(state?.fields ?? []).map((f: { field: string; value: unknown }) => [f.field, f.value])
		)
		expect(byField.get('seriesPrimary')).toEqual({ state: 'value', value: seriesPrimary })
		expect(byField.get('seriesSecondary')).toEqual({ state: 'absent' })
		expect(state?.revision).toBe(1)

		// The revision records exactly the single series transition.
		const revisions = await db2
			.collection('book_history_revisions')
			.find({ asin: mixedAsin, region: REGION, revision: 1 })
			.toArray()
		expect(revisions).toHaveLength(1)
		expect(revisions[0].changedFields.slice().sort()).toEqual(['seriesSecondary'])
		expect(revisions[0].changes.seriesSecondary.before).toEqual({
			state: 'value',
			value: seriesSecondary
		})
		expect(revisions[0].changes.seriesSecondary.after).toEqual({ state: 'absent' })
	}, 30000)

	test('an explicit null series value clears the stored field and records the delta', async () => {
		// The producer's vanished-series signal is `{state: 'value',
		// value: null}` (primary kept selected, secondary gone): the key
		// normalizes away from the book, so `$set` alone can never reach
		// the stored field — the clear must come from the $unset path,
		// which previously only fired on `state: 'absent'`.
		// Series ASINs are 10 chars (B + 9): the stored row must validate
		// through ApiBookSchema for the store's projection to be non-null.
		const nullAsin = 'B0SERIEST3'
		const db2 = collections()
		const seriesPrimary = { asin: 'B0SERIES10', name: 'Series One', position: '1' }
		const seriesSecondary = { asin: 'B0SERIES20', name: 'Spinoff', position: '2' }
		await db2
			.collection('books')
			.insertOne(
				book({ asin: nullAsin, title: 'Null Series Book', seriesPrimary, seriesSecondary }) as never
			)
		await db2.collection('book_history_states').insertOne({
			_id: `${REGION}:${nullAsin}`,
			asin: nullAsin,
			region: REGION,
			allocatedGeneration: 0,
			acceptedGeneration: 0,
			deleteFence: 0,
			revision: 0,
			assetSequence: 1,
			stateVersion: 1,
			established: true,
			legacyCaptured: true,
			fields: [
				{
					field: 'seriesPrimary',
					policy: 'editorial:seriesPrimary:v1',
					value: { state: 'value', value: seriesPrimary },
					baselineAt: new Date('2026-01-01T00:00:00.000Z')
				},
				{
					field: 'seriesSecondary',
					policy: 'editorial:seriesSecondary:v1',
					value: { state: 'value', value: seriesSecondary },
					baselineAt: new Date('2026-01-01T00:00:00.000Z')
				}
			],
			renditions: []
		} as never)
		// The seeded legacy asset keeps assetSequence honest across the run.
		await db2.collection('book_artwork').insertOne({
			asin: nullAsin,
			region: REGION,
			sequence: 1,
			imageId: IMG1,
			legacy: {
				sourceBookId: new ObjectId(),
				storedUrl: `https://m.media-amazon.com/images/I/${IMG1}.jpg`,
				importedAt: new Date('2026-01-01T00:00:00.000Z')
			},
			renditions: []
		} as never)

		// The observation keeps `seriesPrimary` (value envelope present)
		// and carries an explicit null `seriesSecondary` (the producer's
		// vanished-series shape).
		const nullObservation = observation({
			title: 'Null Series Book',
			imageId: IMG1,
			imageUrl: `https://m.media-amazon.com/images/I/${IMG1}.jpg`
		})
		nullObservation.fields.push(
			{
				field: 'seriesPrimary',
				policy: 'editorial:seriesPrimary:v1',
				value: { state: 'value', value: seriesPrimary },
				source: 'audible_api'
			},
			{
				field: 'seriesSecondary',
				policy: 'editorial:seriesSecondary:v1',
				value: { state: 'value', value: null },
				source: 'audible_api'
			}
		)
		const result = await bookHistoryStore.persistObservation({
			asin: nullAsin,
			region: REGION,
			generation: 1,
			book: book({ asin: nullAsin, title: 'Null Series Book' }),
			observation: nullObservation
		})
		expect(result.disposition).toBe('accepted')
		// The explicit null is a real change: the stored field is $unset.
		expect(result.modified).toBe(true)
		// The returned/cached projection keeps the retained series and
		// drops the cleared one.
		expect(result.data.seriesPrimary).toEqual(seriesPrimary)
		expect(result.data.seriesSecondary).toBeUndefined()

		// The stored row RETAINS seriesPrimary and $unsets only
		// seriesSecondary, the rest stands.
		const current = await db2.collection('books').findOne({ asin: nullAsin })
		expect(current).toHaveProperty('seriesPrimary', seriesPrimary)
		expect(current).not.toHaveProperty('seriesSecondary')
		expect(current?.title).toBe('Null Series Book')

		// Baselines: seriesPrimary unchanged, seriesSecondary advanced to
		// the explicit null value; exactly one revision counter step.
		const state = await db2
			.collection('book_history_states')
			.findOne({ _id: `${REGION}:${nullAsin}` })
		const byField = new Map(
			(state?.fields ?? []).map((f: { field: string; value: unknown }) => [f.field, f.value])
		)
		expect(byField.get('seriesPrimary')).toEqual({ state: 'value', value: seriesPrimary })
		expect(byField.get('seriesSecondary')).toEqual({ state: 'value', value: null })
		expect(state?.revision).toBe(1)

		// The revision records exactly the single series transition.
		const revisions = await db2
			.collection('book_history_revisions')
			.find({ asin: nullAsin, region: REGION, revision: 1 })
			.toArray()
		expect(revisions).toHaveLength(1)
		expect(revisions[0].changedFields.slice().sort()).toEqual(['seriesSecondary'])
		expect(revisions[0].changes.seriesSecondary.before).toEqual({
			state: 'value',
			value: seriesSecondary
		})
		expect(revisions[0].changes.seriesSecondary.after).toEqual({ state: 'value', value: null })
	}, 30000)

	test('a series-less observation on a series-bearing row is an equal no-op', async () => {
		// Equality must match the write: stored series keys with no series
		// evidence in the incoming observation are retained by the update
		// path (unknown evidence), so they must not force a redundant
		// `modified: true` write on every accepted fetch.
		const eqAsin = 'B0SERIEST4'
		const db2 = collections()
		const seriesPrimary = { asin: 'B0SERIES10', name: 'Series One', position: '1' }
		await db2
			.collection('books')
			.insertOne(book({ asin: eqAsin, title: 'Equal Series Book', seriesPrimary }) as never)
		await db2.collection('book_history_states').insertOne({
			_id: `${REGION}:${eqAsin}`,
			asin: eqAsin,
			region: REGION,
			allocatedGeneration: 0,
			acceptedGeneration: 0,
			deleteFence: 0,
			revision: 0,
			assetSequence: 1,
			stateVersion: 1,
			established: true,
			legacyCaptured: true,
			fields: [
				{
					field: 'seriesPrimary',
					policy: 'editorial:seriesPrimary:v1',
					value: { state: 'value', value: seriesPrimary },
					baselineAt: new Date('2026-01-01T00:00:00.000Z')
				}
			],
			renditions: []
		} as never)
		// The seeded legacy asset keeps assetSequence honest across the run.
		await db2.collection('book_artwork').insertOne({
			asin: eqAsin,
			region: REGION,
			sequence: 1,
			imageId: IMG1,
			legacy: {
				sourceBookId: new ObjectId(),
				storedUrl: `https://m.media-amazon.com/images/I/${IMG1}.jpg`,
				importedAt: new Date('2026-01-01T00:00:00.000Z')
			},
			renditions: []
		} as never)

		// No series keys on the book, no series fields in the observation
		// (unknown evidence), everything else identical to the stored row.
		const result = await bookHistoryStore.persistObservation({
			asin: eqAsin,
			region: REGION,
			generation: 1,
			book: book({ asin: eqAsin, title: 'Equal Series Book' }),
			observation: observation({
				title: 'Equal Series Book',
				imageId: IMG1,
				imageUrl: `https://m.media-amazon.com/images/I/${IMG1}.jpg`
			})
		})
		expect(result.disposition).toBe('accepted')
		// Equal public projection (modulo the retained stored-only series):
		// no revision, no counter step.
		expect(result.modified).toBe(false)
		// The stored row keeps its series untouched.
		const current = await db2.collection('books').findOne({ asin: eqAsin })
		expect(current).toHaveProperty('seriesPrimary', seriesPrimary)
		expect(current?.title).toBe('Equal Series Book')
		// The returned/cached projection preserves the stored series.
		expect(result.data.seriesPrimary).toEqual(seriesPrimary)
		const state = await db2
			.collection('book_history_states')
			.findOne({ _id: `${REGION}:${eqAsin}` })
		expect(state?.revision).toBe(0)
		const revisions = await db2
			.collection('book_history_revisions')
			.countDocuments({ asin: eqAsin, region: REGION })
		expect(revisions).toBe(0)
	}, 30000)

	test('omits an explicitly undefined optional field instead of nulling it', async () => {
		// ApiHelper sets optional keys to undefined when Audible omits them
		// (e.g. subtitle). Driving the update without `ignoreUndefined` writes
		// null, and the strict books validator types those fields as strings.
		const undefAsin = 'B0UNDEFSUB1'
		const db4 = collections()
		const gen1 = await bookHistoryStore.reserveGeneration(undefAsin, REGION)
		const first = await bookHistoryStore.persistObservation({
			asin: undefAsin,
			region: REGION,
			generation: gen1,
			book: book({ asin: undefAsin, title: 'Undefined Subtitle', subtitle: undefined }),
			observation: observation({ title: 'Undefined Subtitle', imageId: IMG1 })
		})
		expect(first.disposition).toBe('accepted')
		const current = await db4.collection('books').findOne({ asin: undefAsin })
		expect(current).not.toHaveProperty('subtitle')
	}, 30000)

	test('accepts an update when neither side has genre evidence', async () => {
		// Legacy rows never had category ladders. Refusing genre-less
		// updates would freeze every other field on them (the books
		// validator refuses partial writes), so the merge only preserves
		// stored genres when it would actually drop them.
		const noGenreAsin = 'B0GENRLESS'
		const db3 = collections()
		const gen1 = await bookHistoryStore.reserveGeneration(noGenreAsin, REGION)
		const first = await bookHistoryStore.persistObservation({
			asin: noGenreAsin,
			region: REGION,
			generation: gen1,
			book: book({ asin: noGenreAsin, title: 'No Genres', genres: [] }),
			observation: observation({ title: 'No Genres', imageId: IMG1 })
		})
		expect(first.disposition).toBe('accepted')
		// The initial projection parses as a public book (an 11-char ASIN
		// would fail AsinSchema and make the store fall back to the raw
		// document, skipping the intended path below).
		expect(ApiBookSchema.safeParse(first.data).success).toBe(true)
		// An accepted book write must clear a prior backfill skip decision.
		await db3.collection('books').updateOne(
			{ asin: noGenreAsin },
			{
				$set: {
					ratingsBackfillSkip: {
						reason: 'non_book',
						contentType: 'SinglePartIssue',
						markedAt: new Date()
					}
				}
			}
		)
		const gen2 = await bookHistoryStore.reserveGeneration(noGenreAsin, REGION)
		const second = await bookHistoryStore.persistObservation({
			asin: noGenreAsin,
			region: REGION,
			generation: gen2,
			book: book({ asin: noGenreAsin, title: 'Still No Genres', genres: [] }),
			observation: observation({ title: 'Still No Genres', imageId: IMG2 })
		})
		expect(second.disposition).toBe('accepted')
		expect(second.modified).toBe(true)
		const current = await db3.collection('books').findOne({ asin: noGenreAsin })
		expect(current?.title).toBe('Still No Genres')
		expect(current).not.toHaveProperty('ratingsBackfillSkip')
	}, 30000)

	test('an accepted update supplies createdAt on a pre-schema row', async () => {
		// Rows written before the books validator existed lack createdAt,
		// and the strict validator (action=error) rejects an update whose
		// resulting document lacks it. The accepted update path must supply
		// it once, so the repair converges instead of failing validation.
		const preSchemaAsin = 'B0PRESCHEMA1'
		const db5 = collections()
		await db5.collection('books').insertOne({
			...book({ asin: preSchemaAsin, title: 'Pre Schema Row' })
		} as never)
		const gen1 = await bookHistoryStore.reserveGeneration(preSchemaAsin, REGION)
		const first = await bookHistoryStore.persistObservation({
			asin: preSchemaAsin,
			region: REGION,
			generation: gen1,
			book: book({ asin: preSchemaAsin, title: 'Pre Schema Row' }),
			observation: observation({ title: 'Pre Schema Row', imageId: IMG1 })
		})
		expect(first.disposition).toBe('accepted')
		// Drop the field the way legacy rows lack it, keeping the fixed
		// timestamp the store is supposed to preserve.
		await db5
			.collection('books')
			.updateOne({ asin: preSchemaAsin }, { $unset: { createdAt: '' } } as never, {
				bypassDocumentValidation: true
			})
		const before = await db5.collection('books').findOne({ asin: preSchemaAsin })
		expect(before).not.toHaveProperty('createdAt')
		const gen2 = await bookHistoryStore.reserveGeneration(preSchemaAsin, REGION)
		// The producer (GenericShowHelper) passes an ApiBook, which has no
		// createdAt: the write document carries the field only from the
		// supply, so the incoming book must not bring its own.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentional strip of createdAt from the incoming book
		const { createdAt: _stored, ...incomingBook } = book({
			asin: preSchemaAsin,
			title: 'Pre Schema Row Changed'
		})
		const second = await bookHistoryStore.persistObservation({
			asin: preSchemaAsin,
			region: REGION,
			generation: gen2,
			book: incomingBook,
			observation: observation({ title: 'Pre Schema Row Changed', imageId: IMG2 })
		})
		expect(second.disposition).toBe('accepted')
		expect(second.modified).toBe(true)
		const after = await db5.collection('books').findOne({ asin: preSchemaAsin })
		expect(after?.title).toBe('Pre Schema Row Changed')
		expect(after?.createdAt).toBeInstanceOf(Date)
	}, 30000)

	test('accepts an update when a legacy row with a backfill skip marker fails the public parse', async () => {
		// A legacy row that fails ApiBookSchema falls back to the raw
		// document (stripDocMeta), which preserves the internal
		// ratingsBackfillSkip marker. The marker must not reach the
		// $set: the same update unsets it, and a $set on the same path
		// is rejected by the server (code 40).
		const legacyAsin = 'B0LEGACYSK'
		const db5 = collections()
		const gen1 = await bookHistoryStore.reserveGeneration(legacyAsin, REGION)
		const first = await bookHistoryStore.persistObservation({
			asin: legacyAsin,
			region: REGION,
			generation: gen1,
			book: book({ asin: legacyAsin, title: 'Legacy Marker' }),
			observation: observation({ title: 'Legacy Marker', imageId: IMG1 })
		})
		expect(first.disposition).toBe('accepted')
		// The initial projection parses as a public book (an 11-char ASIN
		// would fail AsinSchema and make the store fall back to the raw
		// document, skipping the intended legacy-fallback path below).
		expect(ApiBookSchema.safeParse(first.data).success).toBe(true)
		// Corrupt the row for the legacy case: a non-URL image fails
		// ApiBookSchema (z.string().url()) while the books validator
		// (types.string) accepts it, and the marker rides along.
		await db5.collection('books').updateOne(
			{ asin: legacyAsin },
			{
				$set: {
					image: 'LEGACY-IMAGE-ID',
					ratingsBackfillSkip: {
						reason: 'non_book',
						contentType: 'SinglePartIssue',
						markedAt: new Date()
					}
				}
			}
		)
		const gen2 = await bookHistoryStore.reserveGeneration(legacyAsin, REGION)
		const second = await bookHistoryStore.persistObservation({
			asin: legacyAsin,
			region: REGION,
			generation: gen2,
			book: book({
				asin: legacyAsin,
				title: 'Healed Legacy',
				image: `https://m.media-amazon.com/images/I/${IMG2}.jpg`
			}),
			observation: observation({ title: 'Healed Legacy', imageId: IMG2 })
		})
		expect(second.disposition).toBe('accepted')
		expect(second.modified).toBe(true)
		const current = await db5.collection('books').findOne({ asin: legacyAsin })
		expect(current?.title).toBe('Healed Legacy')
		expect(current).not.toHaveProperty('ratingsBackfillSkip')
	}, 30000)

	test('the returned projection never carries the backfill skip marker on the fallback path', async () => {
		// A stored row that fails ApiBookSchema (non-URL image) is merged
		// via stripDocMeta, which keeps the internal ratingsBackfillSkip
		// marker in `writeBook`. The update unsets the marker, and the
		// returned book is the raw `writeBook` (toApiBook still fails on
		// the inherited invalid image), so the marker must be stripped
		// from the fallback return value as well.
		const noImageAsin = 'B0LEGACYNO'
		const db6 = collections()
		const gen1 = await bookHistoryStore.reserveGeneration(noImageAsin, REGION)
		const first = await bookHistoryStore.persistObservation({
			asin: noImageAsin,
			region: REGION,
			generation: gen1,
			book: book({ asin: noImageAsin, title: 'Marker No Image' }),
			observation: observation({ title: 'Marker No Image', imageId: IMG1 })
		})
		expect(first.disposition).toBe('accepted')
		// The initial projection parses as a public book (an 11-char ASIN
		// would fail AsinSchema and make the store fall back to the raw
		// document, skipping the intended legacy-fallback path below).
		expect(ApiBookSchema.safeParse(first.data).success).toBe(true)
		// Corrupt the row the same way as the legacy case, but leave the
		// incoming book without an `image` so the merged writeBook keeps
		// the invalid value and the toApiBook parse fails again.
		await db6.collection('books').updateOne(
			{ asin: noImageAsin },
			{
				$set: {
					image: 'LEGACY-IMAGE-ID',
					ratingsBackfillSkip: {
						reason: 'non_book',
						contentType: 'SinglePartIssue',
						markedAt: new Date()
					}
				}
			}
		)
		const gen2 = await bookHistoryStore.reserveGeneration(noImageAsin, REGION)
		const second = await bookHistoryStore.persistObservation({
			asin: noImageAsin,
			region: REGION,
			generation: gen2,
			book: book({ asin: noImageAsin, title: 'Marker No Image Healed', image: undefined }),
			observation: observation({ title: 'Marker No Image Healed', imageId: IMG2 })
		})
		expect(second.disposition).toBe('accepted')
		expect(second.modified).toBe(true)
		// The row no longer carries the marker (unset by the update)...
		const current = await db6.collection('books').findOne({ asin: noImageAsin })
		expect(current?.title).toBe('Marker No Image Healed')
		expect(current).not.toHaveProperty('ratingsBackfillSkip')
		// ...and neither does the returned (fallback) projection.
		expect(second.data).not.toHaveProperty('ratingsBackfillSkip')
	}, 30000)

	test('backfill: a legacy row with a validator-rejected extra field lands ratings without the rejected title change', async () => {
		// A backfill-eligible legacy row whose stored document carries an
		// extra field the strict books validator REJECTS: a `seriesPrimary`
		// sub-document whose `name` is a number (the validator demands a
		// string). The product the backfill fetches carries NO series, so the
		// incoming book has no `seriesPrimary` and the merged write RETAINS
		// the stored invalid one — the full-document persistObservation write
		// is then rejected by the validator, and the fenced ratings repair
		// lands the ratings block alone. The attempted title change does NOT
		// land, the state version advances without accepting the rejected
		// observation, and the summary reports one update and no failure.
		const savedHistory = process.env.BOOK_HISTORY_ENABLED
		const savedBatch = process.env.AUDIBLE_BATCH_SIZE
		process.env.BOOK_HISTORY_ENABLED = 'true'
		process.env.AUDIBLE_BATCH_SIZE = '1'
		const asin = 'B0BACKFIL1'
		const key = `${REGION}:${asin}`
		const db7 = collections()
		const baseBook = book({ asin, title: 'Legacy Backfill Row' })
		// Seed a valid, backfill-eligible row (a `rating` so it enters the
		// ratings walk; no `ratings` and no marker).
		await db7.collection('books').insertOne(baseBook as never)
		// Corrupt the row for the strict-validator case: a `seriesPrimary`
		// with a numeric `name` fails the books validator (types.string) and
		// is RETAINED by the merged write (the fetched product has no series),
		// while the row stays backfill-eligible (rating present, ratings
		// absent, no marker).
		await db7
			.collection('books')
			.updateOne(
				{ asin },
				{ $set: { seriesPrimary: { asin: 'B0SERIEX1', name: 123 } } } as never,
				{ bypassDocumentValidation: true }
			)
		const stateBefore = await db7.collection('book_history_states').findOne({ _id: key })
		expect(stateBefore).toBeNull()

		// The real backfill fetch path: ApiBatchHelper.fetchProductsByAsin →
		// fetchPlus. The seeded row's ASIN answers with a full product whose
		// title differs from the stored row (the "attempted title change");
		// the product carries no series, so the merged write retains the
		// stored invalid `seriesPrimary`.
		const product = JSON.parse(JSON.stringify(apiResponse.product)) as Record<string, unknown>
		product.asin = asin
		product.title = 'Refreshed Title'
		delete product.series
		delete product.publication_name
		// With AUDIBLE_BATCH_SIZE=1 the backfill takes the per-book path, so
		// the REAL StitchHelper/ApiHelper fetches a SINGLE product
		// (`response.data.product`), not the bulk `{ products: [...] }` shape.
		mockFetch.mockClear()
		mockFetch.mockResolvedValue({
			data: {
				product,
				response_groups: ['rating', 'contributors', 'product_desc', 'product_attrs', 'product_details']
			}
		})
		// Isolate the fixture: the backfill walk selects EVERY backfill-
		// eligible row in the shared DB (earlier tests seed rows with a
		// `rating` and no `ratings`/marker, which match the walk's filter).
		// Delete all books except this test's ASIN so the walk processes
		// exactly one row and `total`/`updated`/`failed` are deterministic.
		await db7.collection('books').deleteMany({ asin: { $ne: asin } })
		const backfill = new BookBackfillHelper(createMockLogger(), null)
		try {
			const result = await backfill.process()

			// The summary reports one update and no failure (the ratings
			// repair landed; the rejected full write is not a batch failure).
			expect(result).toEqual({ total: 1, updated: 1, skipped: 0, terminalSkipped: 0, failed: 0 })

			// The ratings landed (the fenced repair's $set) ...
			const current = await db7.collection('books').findOne({ asin })
			expect(current?.ratings).toBeDefined()
			expect(current?.ratings).toMatchObject({
				value: expect.any(String),
				numRatings: expect.any(Number)
			})
			// ...but the attempted title change did NOT (the full-document
			// write was rejected by the validator before it could commit
			// the title).
			expect(current?.title).toBe('Legacy Backfill Row')
			// The rejected extra field is untouched (the repair is a pure
			// ratings-only addition).
			expect(current?.seriesPrimary).toEqual({ asin: 'B0SERIEX1', name: 123 })
			// The state version advanced (the repair's fence $inc) WITHOUT
			// accepting the rejected observation: no title baseline, no
			// title revision — the observation was never accepted, only the
			// ratings fence advanced.
			const stateAfter = await db7.collection('book_history_states').findOne({ _id: key })
			expect(stateAfter).not.toBeNull()
			expect(stateAfter?.stateVersion).toBeGreaterThan(0)
			const titleBaseline = (stateAfter?.fields ?? []).find(
				(f: { field: string }) => f.field === 'title'
			)
			expect(titleBaseline).toBeUndefined()
			const titleRevision = await db7
				.collection('book_history_revisions')
				.find({ asin, region: REGION, changedFields: { $in: ['title'] } })
				.toArray()
			expect(titleRevision).toHaveLength(0)
		} finally {
			// Restore the environment even if the assertions above throw:
			// a leaked override would flip every later test's history and
			// batch-size behavior.
			if (savedHistory === undefined) delete process.env.BOOK_HISTORY_ENABLED
			else process.env.BOOK_HISTORY_ENABLED = savedHistory
			if (savedBatch === undefined) delete process.env.AUDIBLE_BATCH_SIZE
			else process.env.AUDIBLE_BATCH_SIZE = savedBatch
		}
	}, 30000)

	test('an equal observation on a marker row without createdAt is accepted, removes the marker, and leaves content and updatedAt alone', async () => {
		// A row with a valid public projection, a terminal backfill-skip
		// marker, and NO `createdAt`: submitting an EQUAL observation is
		// accepted with `modified: false` (the equal short-circuit), removes
		// the marker (an accepted book supersedes a backfill-skip decision),
		// and makes NO content or `updatedAt` change (the short-circuit
		// writes nothing to the books row — only the state watermark and the
		// marker-only cleanup advance).
		const asin = 'B0EQMARKER'
		const db7 = collections()
		const baseBook = book({ asin, title: 'Marker Equal Row' })
		await db7.collection('books').insertOne(baseBook as never)
		// Add the terminal marker and drop `createdAt` the way legacy rows
		// lack it.
		await db7
			.collection('books')
			.updateOne(
				{ asin },
				{
					$set: {
						ratingsBackfillSkip: {
							reason: 'non_book',
							contentType: 'SinglePartIssue',
							markedAt: new Date('2026-01-01T00:00:00.000Z')
						}
					},
					$unset: { createdAt: '' }
				} as never,
				{ bypassDocumentValidation: true }
			)
		const before = await db7.collection('books').findOne({ asin })
		expect(before).not.toBeNull()
		expect(before).toHaveProperty('ratingsBackfillSkip')
		expect(before).not.toHaveProperty('createdAt')
		// The stored row must produce a valid public projection: the equal
		// short-circuit (and its `modified: false` assertion) requires
		// `toApiBook` to succeed, which an 11-character ASIN would break.
		expect(ApiBookSchema.safeParse(before).success).toBe(true)
		const updatedAtBefore = before?.updatedAt

		const gen = await bookHistoryStore.reserveGeneration(asin, REGION)
		const result = await bookHistoryStore.persistObservation({
			asin,
			region: REGION,
			generation: gen,
			book: baseBook,
			observation: observation({ title: 'Marker Equal Row', imageId: IMG1 })
		})
		// Accepted (the row is a valid book) but unmodified (equal
		// projection short-circuit: the store wrote no content).
		expect(result.disposition).toBe('accepted')
		expect(result.modified).toBe(false)

		// The marker is removed (an accepted book supersedes a backfill-skip
		// decision, even an equal-projection no-op).
		const after = await db7.collection('books').findOne({ asin })
		expect(after).not.toBeNull()
		expect(after).not.toHaveProperty('ratingsBackfillSkip')
		// No content change: the title stands ...
		expect(after?.title).toBe('Marker Equal Row')
		// ...and `updatedAt` is untouched (the short-circuit's books write is
		// marker-only; no `$currentDate` ran on the content).
		expect(after?.updatedAt).toEqual(updatedAtBefore)
	}, 30000)

	test('an evidence-free refresh on a legacy-image row preserves the stored image and returns a valid projection', async () => {
		// A stored row whose `image` is a non-URL string (fails ApiBookSchema
		// but passes the books validator) is "legacy" for the public parse.
		// An evidence-free refresh (the incoming book carries no `image`)
		// must LEAVE THE STORED IMAGE ALONE (retention for evidence-free
		// fields) while the returned book is repaired to a valid
		// ApiBookSchema projection (the invalid `image` is omitted) that
		// preserves the refreshed title.
		const asin = 'B0LEGIMGEV'
		const db7 = collections()
		const baseBook = book({ asin, title: 'Legacy Image Base' })
		await db7.collection('books').insertOne(baseBook as never)
		// Corrupt the stored image the way legacy rows carry it (a non-URL
		// ID): the books validator accepts it, ApiBookSchema does not.
		await db7
			.collection('books')
			.updateOne({ asin }, { $set: { image: 'LEGACY-IMAGE-ID' } } as never)

		const gen = await bookHistoryStore.reserveGeneration(asin, REGION)
		const result = await bookHistoryStore.persistObservation({
			asin,
			region: REGION,
			generation: gen,
			// The incoming book carries NO `image` (evidence-free refresh):
			// the merged writeBook retains the stored invalid image.
			book: book({ asin, title: 'Legacy Image Refreshed', image: undefined }),
			observation: observation({ title: 'Legacy Image Refreshed', imageId: IMG1 })
		})
		expect(result.disposition).toBe('accepted')
		expect(result.modified).toBe(true)

		// The returned book passes ApiBookSchema (the invalid `image` is
		// omitted from the repaired projection) ...
		expect(ApiBookSchema.safeParse(result.data).success).toBe(true)
		// ...preserves the refreshed title ...
		expect(result.data.title).toBe('Legacy Image Refreshed')
		// ...and omits the invalid image.
		expect(result.data.image).not.toBe('LEGACY-IMAGE-ID')

		// The evidence-free refresh left the STORED image alone (retention:
		// the incoming book carried no image evidence, so the stored
		// non-URL image is not clobbered).
		const current = await db7.collection('books').findOne({ asin })
		expect(current?.image).toBe('LEGACY-IMAGE-ID')
		expect(current?.title).toBe('Legacy Image Refreshed')
	}, 30000)

	test('tags evidence: a refresh with no tag evidence retains stored tags; an explicit empty-tags observation clears them with one delta', async () => {
		// Two evidence classes for tags: (1) a refresh whose observation
		// carries NO tags evidence (the tags group was not fetched →
		// `undefined`, unknown, not absent) must PRESERVE the stored and
		// returned tags with NO tag revision; (2) an explicit empty-tags
		// observation (`tags: []` → `state: 'absent'`) must CLEAR both the
		// stored and returned tags and record EXACTLY ONE `tags` delta to
		// `absent`.
		const asin = 'B0TAGEVID1'
		const key = `${REGION}:${asin}`
		const db7 = collections()
		const storedTags = [{ tagId: 'adbl_rec_tag_0-2-1', name: 'Witty', type: 'mood' }]
		const tagTuples = [['adbl_rec_tag_0-2-1', 'Witty', 'mood']]
		const baseBook = book({ asin, title: 'Tags Evidence' })
		// The stored row must parse as a public projection: a 9-char ASIN
		// would fail `ApiBookSchema`, and the unknown-tags phase's fallback
		// to `baseBook` would then return tags-less data — breaking the
		// returned-tags assertion instead of testing retention.
		expect(ApiBookSchema.safeParse(baseBook).success).toBe(true)

		// Seed a tag-less row and its baselines (title/artwork) in one
		// accepted observation.
		await db7.collection('books').insertOne(baseBook as never)
		const gen1 = await bookHistoryStore.reserveGeneration(asin, REGION)
		await bookHistoryStore.persistObservation({
			asin,
			region: REGION,
			generation: gen1,
			book: baseBook,
			observation: observation({ title: 'Tags Evidence', imageId: IMG1 })
		})
		// Then seed the stored tags: the FIRST observation carrying tag
		// evidence initializes the `tags` baseline silently (no change event)
		// while the real book write lands the tags on the row.
		const gen2 = await bookHistoryStore.reserveGeneration(asin, REGION)
		const seed = await bookHistoryStore.persistObservation({
			asin,
			region: REGION,
			generation: gen2,
			book: { ...baseBook, tags: storedTags },
			observation: observation({ title: 'Tags Evidence', imageId: IMG1, tags: tagTuples })
		})
		expect(seed.disposition).toBe('accepted')
		expect(seed.modified).toBe(true)
		const stateAfterSeed = await db7.collection('book_history_states').findOne({ _id: key })
		const seedRevision = stateAfterSeed?.revision ?? 0
		const seedTagsBaseline = (stateAfterSeed?.fields ?? []).find(
			(f: { field: string }) => f.field === 'tags'
		)
		expect(seedTagsBaseline).toMatchObject({
			policy: 'tags:api:v1',
			value: { state: 'value', value: tagTuples }
		})
		const rowAfterSeed = await db7.collection('books').findOne({ asin })
		expect(rowAfterSeed?.tags).toEqual(storedTags)

		// Phase 1: a refresh with NO tags evidence (the observation carries
		// only the title; the tags group was not fetched). The stored and
		// returned tags are preserved, and NO tag revision is recorded
		// (unknown evidence retains, never compares).
		const gen3 = await bookHistoryStore.reserveGeneration(asin, REGION)
		const phase1 = await bookHistoryStore.persistObservation({
			asin,
			region: REGION,
			generation: gen3,
			// The incoming book carries NO `tags` field at all (the tags
			// group was not fetched): the assertions below verify the stored
			// tags survive a refresh whose evidence says nothing about tags.
			book: baseBook,
			observation: observation({ title: 'Tags Evidence', imageId: IMG1 })
		})
		expect(phase1.disposition).toBe('accepted')
		// The stored row keeps its tags (retention for unknown evidence) ...
		const rowAfterPhase1 = await db7.collection('books').findOne({ asin })
		expect(rowAfterPhase1?.tags).toEqual(storedTags)
		// ...and so does the returned/cached projection.
		expect(phase1.data.tags).toEqual(storedTags)
		// NO tag revision: the revision counter is unchanged from the seed.
		const stateAfterPhase1 = await db7.collection('book_history_states').findOne({ _id: key })
		expect(stateAfterPhase1?.revision).toBe(seedRevision)
		// The tags baseline is retained (not advanced, not cleared).
		const phase1TagsBaseline = (stateAfterPhase1?.fields ?? []).find(
			(f: { field: string }) => f.field === 'tags'
		)
		expect(phase1TagsBaseline).toMatchObject({
			value: { state: 'value', value: tagTuples }
		})

		// Phase 2: an explicit empty-tags observation (`tags: []` → the
		// producer records `state: 'absent'`). The stored and returned tags
		// are cleared, and EXACTLY ONE `tags` delta to `absent` is recorded.
		const gen4 = await bookHistoryStore.reserveGeneration(asin, REGION)
		const phase2 = await bookHistoryStore.persistObservation({
			asin,
			region: REGION,
			generation: gen4,
			book: { ...baseBook, tags: [] },
			// `absent: ['tags']` records the explicit clear (`state:
			// 'absent'`); passing `tags: []` alone would create
			// `{ state: 'value', value: [] }` because the empty array is
			// truthy, which the store would treat as a value, not a clear.
			observation: observation({ title: 'Tags Evidence', imageId: IMG1, absent: ['tags'] })
		})
		expect(phase2.disposition).toBe('accepted')
		expect(phase2.modified).toBe(true)
		// The stored row's tags are cleared ...
		const rowAfterPhase2 = await db7.collection('books').findOne({ asin })
		expect(rowAfterPhase2?.tags).toEqual([])
		// ...and so is the returned/cached projection.
		expect(phase2.data.tags).toEqual([])

		// Exactly ONE `tags` delta to `absent` was recorded (the phase-1
		// refresh recorded none; the phase-2 clear is the only transition).
		const stateAfterPhase2 = await db7.collection('book_history_states').findOne({ _id: key })
		expect(stateAfterPhase2?.revision).toBe(seedRevision + 1)
		const tagsBaselineAfter = (stateAfterPhase2?.fields ?? []).find(
			(f: { field: string }) => f.field === 'tags'
		)
		expect(tagsBaselineAfter).toMatchObject({
			policy: 'tags:api:v1',
			value: { state: 'absent' }
		})
		const tagsRevisions = await db7
			.collection('book_history_revisions')
			.find({ asin, region: REGION, changedFields: { $in: ['tags'] } })
			.toArray()
		expect(tagsRevisions).toHaveLength(1)
		expect(tagsRevisions[0].changedFields).toEqual(['tags'])
		expect(tagsRevisions[0].changes.tags.before).toEqual({
			state: 'value',
			value: tagTuples
		})
		expect(tagsRevisions[0].changes.tags.after).toEqual({ state: 'absent' })
	}, 30000)
})
