// Integration for the book history CLI protocol (audit / prepare / seed /
// status) against a single-node replica set. Seed runs end-to-end through
// the store's per-row majority transactions: legacy capture for the current
// books, checkpoint advancement, and completion. Audit is asserted to be
// non-mutating.
//
// Same gating convention as the live tests: explicit
// `HISTORY_TEST_MONGODB_URI` replica-set URI or a running Docker daemon;
// otherwise the suite skips.
//
// Run via `bun run test:history` (`--parallel=1`): the two book-history
// suites share the in-process papr/bookHistoryStore singletons, and bun's
// default file parallelism can interleave their containers into a
// MongoNotConnectedError in beforeAll.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { MongoClient, ObjectId } from 'mongodb'

import { type HistoryMongo,resolveHistoryMongo } from './env'

import { bookHistoryStore } from '#config/papr'

const available = (() => {
	if (process.env.HISTORY_TEST_MONGODB_URI) return true
	// A missing docker executable throws ENOENT from spawnSync; `Bun.which`
	// yields null instead, so absent Docker takes the skip path.
	if (Bun.which('docker') === null) return false
	const probe = Bun.spawnSync(['docker', 'info'] as const)
	return probe.exitCode === 0
})()

let history: HistoryMongo | null = null
let client: MongoClient | null = null
let db: ReturnType<MongoClient['db']> | null = null

const run = available ? describe : describe.skip

run('history CLI protocol against a replica set', () => {
	beforeAll(async () => {
		history = await resolveHistoryMongo('rollout')
		if (!history) throw new Error('no transaction-capable replica set available')
		client = new MongoClient(history.uri, { serverSelectionTimeoutMS: 5000, ignoreUndefined: true })
		await client.connect()
		bookHistoryStore.configure(client)
		db = client.db('audnexus')
		await db.dropDatabase()
		// The seed path requires the prepared named indexes; run the
		// prepare step for real.
		const { prepare } = await import('../../src/history')
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

	test('seed reports an empty run cleanly over an empty books collection', async () => {
		const { seed, status } = await import('../../src/history')
		const result = await seed(client, false)
		expect(result.message).toBe('seed complete')
		expect(result.rows).toBe(0)
		const out = await status(client)
		expect(out.seed?.completed).toBe(true)
		expect(out.recognizedAssets).toBe(0)
	})

	test('audit reports identity outcomes without mutating the collection', async () => {
		const rows: Array<Record<string, unknown>> = []
		const { seed, audit } = await import('../../src/history')

		// Seed some source rows: one trusted with an Amazon image, one
		// unparsed image, one region-less competitor for another asin, and
		// one invalid ASIN.
		const now = new Date()
		await db
			.collection('books')
			.insertMany([
				{
					asin: 'B0HISTCLI1',
					region: 'us',
					image: 'https://m.media-amazon.com/images/I/TRUSTEDTRUSTEDTRUSTEDTRUSTEDTRUSTED.jpg',
					createdAt: now,
					updatedAt: now
				},
				{
					asin: 'B0HISTCLI2',
					region: 'us',
					image: 'https://rawpics.example/cover/x.jpg',
					createdAt: now,
					updatedAt: now
				},
				{
					asin: 'B0HISTCLI3',
					image: 'https://m.media-amazon.com/images/I/COMPETITORCOMPETITORCOMPETITORCOMP.jpg',
					createdAt: now,
					updatedAt: now
				},
				{ asin: 'not-an-asin', region: 'us', createdAt: now, updatedAt: now }
			] as never)

		// Run the seed for real: all four rows must be processed through
		// their own transactions.
		const seedResult = await seed(client, true)
		expect(seedResult.message).toBe('seed complete')
		expect(seedResult.rows).toBe(4)

		const rowsBefore = await collections().collection('book_artwork').countDocuments({})
		const stateBefore = await collections().collection('book_history_states').countDocuments({})

		const summary = await audit(client, (row) => {
			rows.push(row)
		})
		expect(summary.type).toBe('summary')
		expect(summary.counts.scanned).toBe(4)
		// B0HISTCLI1/B0HISTCLI2: trusted exact rows. The region-less row
		// counts as missing_region and is never classified in pass 2 (its
		// identity is unresolvable), so no ambiguity; the invalid ASIN row
		// counts as invalid_asin with no image.
		expect(summary.counts.trusted).toBe(2)
		expect(summary.counts.invalidAsin).toBe(1)
		expect(summary.counts.missingRegion).toBe(1)
		expect(summary.counts.recognizedImages).toBe(2)
		expect(summary.counts.unparsedImages).toBe(1)
		expect(summary.counts.noImage).toBe(1)
		expect(summary.counts.duplicateIdentity).toBe(0)
		expect(summary.counts.ambiguousIdentity).toBe(0)
		const identityExceptions = rows.filter((row) => row.type === 'identity_exception')
		expect(identityExceptions).toHaveLength(2)
		expect(rows[rows.length - 1].type).toBe('summary')

		// Audit is read-only.
		const rowsAfter = await collections().collection('book_artwork').countDocuments({})
		const stateAfter = await collections().collection('book_history_states').countDocuments({})
		expect(rowsAfter).toBe(rowsBefore)
		expect(stateAfter).toBe(stateBefore)
	})

	test('identity-exception validator accepts a string _id and distinct rows', async () => {
		// P0 regression: prepare() ran updateSchemas above, so the live
		// $jsonSchema validator must accept both the ObjectId _id (trusted
		// rows) and the deterministic string key (non-ObjectId rows). A
		// string-key upsert is rejected outright by the legacy ObjectId-only
		// validator, so a persisted doc here is exactly the P0 the fix closed.
		const db2 = collections()
		const session = await client.startSession()
		try {
			const sourceA = {
				_id: 'audit-string-id-2',
				asin: 'B0HISTVAL1',
				region: 'us',
				image: 'https://m.media-amazon.com/images/I/VALIDATORVALIDATORVALIDATORV.jpg'
			}
			await bookHistoryStore.recordIdentityException(session, sourceA as never)
			const keyA = 'B0HISTVAL1::value::us::string:audit-string-id-2'
			const docA = await db2
				.collection('book_history_identity_exceptions')
				.findOne({ _id: keyA })
			expect(docA?._id).toBe(keyA)
			expect(docA?.asin).toBe('B0HISTVAL1')
			expect(docA?.region).toEqual({ state: 'value', value: 'us' })
			expect(docA?.reasons).toEqual(['unsupported_id'])
			expect(docA?.storedUrl).toBe(sourceA.image)

			// Two distinct non-ObjectId source rows (same asin/regionState,
			// different source _id) never share one document: the per-source
			// key embeds the row's own `_id`.
			const keyB = 'B0HISTVAL2::value::us::string:audit-string-id-3'
			const keyC = 'B0HISTVAL2::value::us::string:audit-string-id-4'
			for (const _id of ['audit-string-id-3', 'audit-string-id-4'] as const) {
				await bookHistoryStore.recordIdentityException(
					session,
					({
						_id,
						asin: 'B0HISTVAL2',
						region: 'us',
						image: 'https://m.media-amazon.com/images/I/VALIDATORVALIDATORVALIDATORW.jpg'
					} as never)
				)
			}
			const docs = await db2
				.collection('book_history_identity_exceptions')
				.find({ _id: { $in: [keyB, keyC] } })
				.sort({ _id: 1 })
				.toArray()
			expect(docs.map((d) => d._id)).toEqual([keyB, keyC])

			// Keep the audit's count for the status test: drop these docs.
			await db2
				.collection('book_history_identity_exceptions')
				.deleteMany({ asin: { $in: ['B0HISTVAL1', 'B0HISTVAL2'] } })
		} finally {
			await session.endSession()
		}
	}, 30000)

	test('a completed seed re-run is a no-op and a restart supersedes the run', async () => {
		const { seed, status } = await import('../../src/history')

		// (a) The audit test left a completed seed (runId A) over four rows:
		// re-running without restart must report the completed no-op without
		// touching the retained data.
		const completed = await status(client)
		const runIdA = completed.seed?.runId
		expect(runIdA).toBeDefined()
		expect(completed.seed?.completed).toBe(true)
		const artworkA = await collections().collection('book_artwork').countDocuments({})
		const stateA = await collections().collection('book_history_states').countDocuments({})
		const noOp = await seed(client, false)
		expect(noOp.message).toBe('seed already completed')
		expect(noOp.runId).toBe(runIdA)
		expect(noOp.rows).toBe(0)
		expect(noOp.batches).toBe(0)
		expect(await collections().collection('book_artwork').countDocuments({})).toBe(artworkA)
		expect(await collections().collection('book_history_states').countDocuments({})).toBe(stateA)

		// A restart supersedes the finished run: a new runId, full rescan.
		const restarted = await seed(client, true)
		expect(restarted.message).toBe('seed complete')
		const runIdB = restarted.runId
		expect(runIdB).toBeDefined()
		expect(runIdB).not.toBe(runIdA)
		expect(restarted.rows).toBe(4)
		// The retained data is intact: legacy assets are deduplicated by
		// imageId and trusted states merged in place, so the counts survive
		// the rescan.
		expect(await collections().collection('book_artwork').countDocuments({})).toBe(artworkA)
		expect(await collections().collection('book_history_states').countDocuments({})).toBe(stateA)
		const checkpoint = (
			await collections()
				.collection('book_history_seed_progress')
				.findOne({ _id: 'legacy-artwork-v1' })
		) as { runId: string; completed: boolean }
		expect(checkpoint.runId).toBe(runIdB)
		expect(checkpoint.completed).toBe(true)

		// (b) A stale runner against the superseded run is stopped at its
		// row start: the in-transaction checkpoint re-read no longer matches
		// runId A.
		const rows = await db.collection('books').find({}).sort({ _id: 1 } as never).toArray()
		expect(rows.length).toBeGreaterThan(0)
		const session = await client.startSession()
		try {
			await expect(
				bookHistoryStore.withSeedTransaction(async (txSession) => {
					await bookHistoryStore.seedRow(txSession, rows[0]._id as never, runIdA)
				})
			).rejects.toThrow('Seed run superseded')
		} finally {
			await session.endSession()
		}
	}, 60000)

	test('seedCheckpoint first-advance is joiner-compatible and rejects a stale divergent write', async () => {
		const { status } = await import('../../src/history')
		const out = await status(client)
		const runId = out.seed?.runId
		expect(runId).toBeDefined()
		expect(out.seed?.completed).toBe(true)
		const rows = await db.collection('books').find({}).sort({ _id: 1 } as never).toArray()
		const lastRow = rows[rows.length - 1]
		const firstRow = rows[0]
		expect(lastRow._id).toBeInstanceOf(ObjectId)
		expect(firstRow._id).toBeInstanceOf(ObjectId)
		// The checkpoint sits at the final watermark (the completed run's
		// last row). Two first-advance (`expectLastId: null`) cases:
		// (a) a cooperating joiner that rebased onto the winner's watermark
		//    writes back the stored watermark — idempotent, must match (1)
		//    and not move the watermark;
		// (b) a genuinely stale runner writing a divergent (earlier)
		//    watermark — must match zero documents and not move it.
		const lastIdBefore = out.seed?.lastId
		expect(lastIdBefore?.equals(lastRow._id as ObjectId)).toBe(true)
		const session = await client.startSession()
		try {
			const joinerMatched = await bookHistoryStore.withSeedTransaction(async (txSession) => {
				return bookHistoryStore.seedCheckpoint(
					txSession,
					runId,
					lastRow._id as ObjectId,
					null
				)
			})
			expect(joinerMatched).toBe(1)
			const staleMatched = await bookHistoryStore.withSeedTransaction(async (txSession) => {
				return bookHistoryStore.seedCheckpoint(
					txSession,
					runId,
					firstRow._id as ObjectId,
					null
				)
			})
			expect(staleMatched).toBe(0)
		} finally {
			await session.endSession()
		}
		const outAfter = await status(client)
		expect(outAfter.seed?.lastId?.equals(lastIdBefore as ObjectId)).toBe(true)
	}, 30000)

	test('status reports the retained seed outcome', async () => {
		const { status } = await import('../../src/history')
		const out = await status(client)
		expect(out.seed?.completed).toBe(true)
		expect(out.activeStates).toBe(0)
		expect(out.pendingStates).toBeGreaterThanOrEqual(1)
		expect(out.recognizedAssets).toBeGreaterThanOrEqual(1)
		expect(out.unparsedAssets).toBeGreaterThanOrEqual(1)
		expect(out.retainedIdentityExceptions).toBe(2)
	})
})
