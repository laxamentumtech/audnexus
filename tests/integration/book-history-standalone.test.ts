// Real-transaction integration for the book history feature against a
// single-node replica set. Covers the store's transactional invariants
// (first-touch baselines with no initial change events, revision + gallery
// writes, equal short-circuit, stale disposition, genre safeguard, delete
// survival with legacy capture on re-create) and the read side (unparsed
// artwork retention).
//
// Gating follows the live-test convention: an explicit
// `HISTORY_TEST_MONGODB_URI` replica-set URI, or a running Docker daemon
// (the harness starts a single-node RS on a free port). Neither → the suite
// skips, so `bun run test` stays green on machines without Docker.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { MongoClient, ObjectId } from 'mongodb'

import { type HistoryMongo,resolveHistoryMongo } from './env'

import { bookHistoryStore } from '#config/papr'
import type { PersistInput } from '#helpers/database/papr/BookHistoryStore'

const available = (() => {
	if (process.env.HISTORY_TEST_MONGODB_URI) return true
	const probe = Bun.spawnSync(['docker', 'info'] as const)
	return probe.exitCode === 0
})()

const ASIN = 'B0HISTINT1'
const REGION = 'us'
const KEY = `${REGION}:${ASIN}`
const IMG1 = 'AAAABBBBCCCCDDDDEEEEFFFGGGHHHHIIIIJJJJKKMM'
const IMG2 = 'NEWNEWNEWNEWNEWNEWNEWNEWNEWNEWNEWNEWNEW1'

// The genre safeguard (reproduced from the original update flow) requires
// non-empty incoming genres, so every fixture carries a recognized genre by
// default; the safeguard test strips this explicitly to an empty array.
const GENRES = [{ type: 'genre', asin: '1234567890', name: 'Fiction' }] as const

function book(overrides: Record<string, unknown> = {}) {
	return {
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

function observation(overrides: {
	title?: string
	imageId?: string | null
	imageUrl?: string
} = {}) {
	const imageId = overrides.imageId !== undefined ? overrides.imageId : IMG1
	return {
		observedAt: new Date(),
		apiReceivedAt: new Date(),
		responseGroups: ['default'],
		requestedRenditions: ['default'],
		fields: [
			{
				field: 'title',
				policy: 'editorial:title:v1',
				value: { state: 'value', value: overrides.title ?? 'Original Title' },
				source: 'audible_api'
			}
		],
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
		updateRequested: true,
		...input
	}
}

let history: HistoryMongo | null = null
let client: MongoClient | null = null
let db: ReturnType<MongoClient['db']> | null = null

const run = available ? describe : describe.skip

run('BookHistoryStore against a replica set', () => {
	beforeAll(async () => {
		history = await resolveHistoryMongo()
		if (!history) throw new Error('no transaction-capable replica set available')
		client = new MongoClient(history.uri, { serverSelectionTimeoutMS: 5000 })
		await client.connect()
		bookHistoryStore.configure(client)
		db = client.db('audnexus')
		await db.dropDatabase()
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

		const state = await collections()
			.collection('book_history_states')
			.findOne({ _id: KEY })
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

		const state = await collections()
			.collection('book_history_states')
			.findOne({ _id: KEY })
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

	test('an equal accepted observation bumps the watermark without a revision', async () => {
		const before = (
			await collections().collection('book_history_states').findOne({ _id: KEY })
		)?.revision
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
		const after = (await collections().collection('book_history_states').findOne({ _id: KEY }))?.revision
		expect(after).toBe(before)
	})

	test('a stale generation makes no changes at all', async () => {
		const stateBefore = await collections()
			.collection('book_history_states')
			.findOne({ _id: KEY })
		const result = await bookHistoryStore.persistObservation(
			persistInput({
				generation: 1,
				book: book({ title: 'Stale Title' }),
				observation: observation({ title: 'Stale Title' })
			})
		)
		expect(result.disposition).toBe('stale')
		expect(result.modified).toBe(false)
		const stateAfter = await collections()
			.collection('book_history_states')
			.findOne({ _id: KEY })
		expect(stateAfter).toEqual(stateBefore)
		const current = await collections().collection('books').findOne({ asin: ASIN })
		expect(current?.title).toBe('Changed Title')
	})

	test('the genre safeguard rejects a book that empties its genres', async () => {
		const withGenres = book({ title: 'Genres Book' })
		await bookHistoryStore.persistObservation(
			persistInput({
				generation: 4,
				book: withGenres,
				observation: observation({ title: 'Genres Book', imageId: IMG2 })
			})
		)
		const rejected = await bookHistoryStore.persistObservation(
			persistInput({
				generation: 5,
				book: book({ title: 'Genres Stripped', genres: [] }),
				observation: observation({ title: 'Genres Stripped', imageId: IMG2 })
			})
		)
		expect(rejected.disposition).toBe('rejected')
		const current = await collections().collection('books').findOne({ asin: ASIN })
		expect(current?.title).toBe('Genres Book')
	})

	test('deleteCurrent keeps history and re-creation triggers legacy capture', async () => {
		const stateBefore = await collections()
			.collection('book_history_states')
			.findOne({ _id: KEY })
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

		const stateAfter = await collections()
			.collection('book_history_states')
			.findOne({ _id: KEY })
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
		const stateFinal = await collections()
			.collection('book_history_states')
			.findOne({ _id: KEY })
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
	await db2.collection('books').insertOne({
		asin: legacyAsin,
		region: REGION,
		title: 'Legacy Row',
		image: `https://m.media-amazon.com/images/I/${IMG1}.jpg`
	} as never)
	const result = await bookHistoryStore.persistObservation({
		asin: legacyAsin,
		region: REGION,
		generation: 1,
		book: book({ asin: legacyAsin, title: 'Legacy Row' }),
		observation: observation({
			title: 'Legacy Row',
			imageId: IMG2,
			imageUrl: `https://m.media-amazon.com/images/I/${IMG2}.jpg`
		}),
		updateRequested: true
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

test('an equal observation on a seeded empty-baseline book initializes baselines', async () => {
	// F2 regression: an established state with no baselines (seed
	// outcome) must be initialized from the next accepted — equal —
	// observation, and a restricted rendition transition on an equal
	// public projection still produces a revision.
	const seedAsin = 'B0SEEDEQ01'
	const db2 = collections()
	await db2.collection('books').insertOne({
		asin: seedAsin,
		region: REGION,
		title: 'Seeded Book',
		image: `https://m.media-amazon.com/images/I/${IMG1}.jpg`
	} as never)
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
		}),
		updateRequested: true
	})
	expect(result.disposition).toBe('accepted')
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
			observation: observation(),
			updateRequested: true
		})
	).resolves.toMatchObject({ disposition: 'accepted' })
	// Now add a null-region competitor for the same identity.
	const rows = await db2.collection('books').find({ asin: conflictAsin }).toArray()
	expect(rows).toHaveLength(1)
	await db2.collection('books').updateOne(
		{ _id: rows[0]._id },
		{ $set: { region: null } }
	)
	await expect(
		bookHistoryStore.persistObservation({
			asin: conflictAsin,
			region: REGION,
			generation: 2,
			book: book({ asin: conflictAsin }),
			observation: observation(),
			updateRequested: true
		})
	).rejects.toThrow('identity conflict')
	// The first (pre-competitor) acceptance stands; the rejected run
	// consumed no generation.
	await expect(
		db2.collection('book_history_states').findOne({ _id: stateId })
	).resolves.toMatchObject({ acceptedGeneration: 1 })
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
})
