// Integration for the book history CLI protocol (audit / prepare / seed /
// status) against a single-node replica set. Seed runs end-to-end through
// the store's per-row majority transactions: legacy capture for the current
// books, checkpoint advancement, and completion. Audit is asserted to be
// non-mutating.
//
// Same gating convention as the live tests: explicit
// `HISTORY_TEST_MONGODB_URI` replica-set URI or a running Docker daemon;
// otherwise the suite skips.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { MongoClient } from 'mongodb'

import { type HistoryMongo,resolveHistoryMongo } from './env'

import { bookHistoryStore } from '#config/papr'

const available = (() => {
	if (process.env.HISTORY_TEST_MONGODB_URI) return true
	const probe = Bun.spawnSync(['docker', 'info'] as const)
	return probe.exitCode === 0
})()

let history: HistoryMongo | null = null
let client: MongoClient | null = null
let db: ReturnType<MongoClient['db']> | null = null

const run = available ? describe : describe.skip

run('history CLI protocol against a replica set', () => {
	beforeAll(async () => {
		history = await resolveHistoryMongo()
		if (!history) throw new Error('no transaction-capable replica set available')
		client = new MongoClient(history.uri, { serverSelectionTimeoutMS: 5000 })
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
