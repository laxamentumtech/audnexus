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
