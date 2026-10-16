// Measure how often Audible's RAW API responses omit the author ASIN on book
// listings, per region, and how that omission rate splits between author
// names that resolve (case/whitespace-folded) into the `authors` collection
// versus names that don't.
//
// Raw responses matter: books stored in the DB may already have the omitted
// ASINs filled in by book stitching (AuthorNameIndex), so measuring stored
// entries would understate the omission rate Audible itself produces. The
// script therefore re-fetches each sampled book from Audible's catalog API
// (bounded concurrency) and measures the author entries in the raw response.
//
// Usage:
//   MONGODB_URI=mongodb://... bun run scripts/measure-author-asin-coverage.ts [--sample N] [--days N]
//
// Read-only against the DB; samples N books (default 500) per region via
// $sample, restricted to books created within the last N days (default 90;
// --days 0 = all-time), loads the `authors` collection into an in-memory
// name -> ASIN map, and fetches the raw catalog product for each sampled
// book (concurrency 2). The US sample includes legacy regionless books.

import { MongoClient } from 'mongodb'
import { mkdirSync, writeFileSync } from 'node:fs'

import { foldName } from '#helpers/utils/foldName'
import { regions } from '#static/regions'

// Regions to measure (subset of the full region list)
const SAMPLED_REGIONS = ['us', 'uk', 'de', 'au', 'ca'] as const

const DEFAULT_SAMPLE_SIZE = 500
const DEFAULT_WINDOW_DAYS = 90
const RAW_FETCH_CONCURRENCY = 2
const RAW_FETCH_TIMEOUT_MS = 15_000
const MS_PER_DAY = 86_400_000

export interface BookAuthorEntry {
	asin?: string
	name: string
}

export interface BookRow {
	asin: string
	region: string
	authors: BookAuthorEntry[]
}

export interface AuthorRow {
	asin: string
	name: string
	aliases?: string[]
}

export interface RegionStats {
	books: number
	// raw catalog responses successfully fetched (the measured population)
	rawFetched: number
	// sampled books whose raw response could not be fetched
	rawExcluded: number
	authorEntries: number
	// author entries with no `asin`
	asinMissing: number
	omissionRate: number
	// entries whose name resolves (folded) to >=1 author ASIN
	nameMatched: number
	// of the matched, entries missing the ASIN (the actionable figure)
	missingAmongMatched: number
	omissionRateAmongMatches: number
	// entries whose name resolves to 0 author ASINs
	notInAuthors: number
	missingAmongNotInAuthors: number
	omissionRateAmongNonMatches: number
	// entries whose name resolves to >1 distinct ASINs (homonyms)
	homonymAmbiguous: number
}

export interface CoverageReport {
	date: string
	sampleSize: number
	windowDays: number
	regions: Record<string, RegionStats>
	total: RegionStats
}

export function buildNameAsinMap(authors: AuthorRow[]): Map<string, Set<string>> {
	const map = new Map<string, Set<string>>()
	for (const author of authors) {
		const names = [author.name, ...(author.aliases ?? [])]
		for (const name of names) {
			const key = foldName(name)
			const asins = map.get(key) ?? new Set<string>()
			asins.add(author.asin)
			map.set(key, asins)
		}
	}
	return map
}

const emptyStats = (): RegionStats => ({
	books: 0,
	rawFetched: 0,
	rawExcluded: 0,
	authorEntries: 0,
	asinMissing: 0,
	omissionRate: 0,
	nameMatched: 0,
	missingAmongMatched: 0,
	omissionRateAmongMatches: 0,
	notInAuthors: 0,
	missingAmongNotInAuthors: 0,
	omissionRateAmongNonMatches: 0,
	homonymAmbiguous: 0
})

// Pure analysis over collection-shaped inputs; no DB access here.
export function measureCoverage(
	books: BookRow[],
	nameAsinMap: Map<string, Set<string>>
): {
	regions: Record<string, RegionStats>
	total: RegionStats
} {
	const regions: Record<string, RegionStats> = {}
	for (const region of SAMPLED_REGIONS) regions[region] = emptyStats()

	for (const book of books) {
		const stats = regions[book.region]
		if (!stats) continue
		stats.books += 1
		for (const author of book.authors ?? []) {
			stats.authorEntries += 1
			const missing = !author.asin
			if (missing) stats.asinMissing += 1
			const asins = nameAsinMap.get(foldName(author.name))
			if (asins && asins.size > 0) {
				stats.nameMatched += 1
				if (missing) stats.missingAmongMatched += 1
				if (asins.size > 1) stats.homonymAmbiguous += 1
			} else {
				stats.notInAuthors += 1
				if (missing) stats.missingAmongNotInAuthors += 1
			}
		}
	}

	const finalize = (stats: RegionStats): RegionStats => {
		stats.omissionRate = stats.authorEntries === 0 ? 0 : stats.asinMissing / stats.authorEntries
		stats.omissionRateAmongMatches =
			stats.nameMatched === 0 ? 0 : stats.missingAmongMatched / stats.nameMatched
		stats.omissionRateAmongNonMatches =
			stats.notInAuthors === 0 ? 0 : stats.missingAmongNotInAuthors / stats.notInAuthors
		return stats
	}

	for (const stats of Object.values(regions)) finalize(stats)

	const total = emptyStats()
	for (const stats of Object.values(regions)) {
		total.books += stats.books
		total.rawFetched += stats.rawFetched
		total.rawExcluded += stats.rawExcluded
		total.authorEntries += stats.authorEntries
		total.asinMissing += stats.asinMissing
		total.nameMatched += stats.nameMatched
		total.missingAmongMatched += stats.missingAmongMatched
		total.notInAuthors += stats.notInAuthors
		total.missingAmongNotInAuthors += stats.missingAmongNotInAuthors
		total.homonymAmbiguous += stats.homonymAmbiguous
	}
	finalize(total)

	return { regions, total }
}

const pct = (fraction: number) => `${(fraction * 100).toFixed(1)}%`

export function formatReport(report: CoverageReport): string {
	const header =
		'region  books  fetched  entries  missing(%)  missingAmongMatches(%)  missingAmongNonMatches(%)  matches  notInAuthors  ambiguous'
	const window =
		report.windowDays === 0 ? 'all-time' : `created within the last ${report.windowDays} days`
	const lines: string[] = [
		`Author ASIN coverage in Audible raw responses — ${report.date} (sample ${report.sampleSize}/region, ${window})`,
		'',
		header
	]
	const row = (label: string, s: RegionStats) =>
		`${label.padEnd(6)}  ${String(s.books).padStart(5)}  ${String(s.rawFetched).padStart(7)}  ${String(
			s.authorEntries
		).padStart(7)}  ${pct(s.omissionRate).padStart(11)}  ${pct(s.omissionRateAmongMatches).padStart(
			24
		)}  ${pct(s.omissionRateAmongNonMatches).padStart(26)}  ${String(s.nameMatched).padStart(
			7
		)}  ${String(s.notInAuthors).padStart(12)}  ${String(s.homonymAmbiguous).padStart(9)}`
	for (const region of SAMPLED_REGIONS) lines.push(row(region, report.regions[region]))
	lines.push(row('TOTAL', report.total))
	return lines.join('\n')
}

const parseFlagValue = (argv: string[], flag: string, min: number): number | undefined => {
	const index = argv.indexOf(flag)
	if (index === -1) return undefined
	const value = Number.parseInt(argv[index + 1] ?? '', 10)
	return Number.isFinite(value) && value >= min ? value : undefined
}

const parseSampleSize = (argv: string[]): number =>
	parseFlagValue(argv, '--sample', 1) ?? DEFAULT_SAMPLE_SIZE

const parseWindowDays = (argv: string[]): number =>
	parseFlagValue(argv, '--days', 0) ?? DEFAULT_WINDOW_DAYS

// Collection-like interfaces so the DB layer stays swappable and testable
export interface BookCollectionLike {
	aggregate: (pipeline: Record<string, unknown>[]) => AsyncIterable<BookRow>
}
export interface AuthorCollectionLike {
	find: (
		filter: Record<string, unknown>,
		options: { projection: Record<string, 1> }
	) => AsyncIterable<AuthorRow>
}

export async function collectData(
	books: BookCollectionLike,
	authors: AuthorCollectionLike,
	sampleSize: number,
	windowDays: number
): Promise<{ books: BookRow[]; authors: AuthorRow[] }> {
	const sampledBooks: BookRow[] = []
	for (const region of SAMPLED_REGIONS) {
		const match: Record<string, unknown> = {
			// Legacy US books were stored without a region field
			region: region === 'us' ? { $in: ['us', null] } : region
		}
		if (windowDays > 0) match.createdAt = { $gte: new Date(Date.now() - windowDays * MS_PER_DAY) }
		for await (const doc of books.aggregate([
			{ $match: match },
			{ $sample: { size: sampleSize } }
		])) {
			sampledBooks.push({ asin: doc.asin, region: doc.region ?? 'us', authors: doc.authors })
		}
	}
	const authorRows: AuthorRow[] = []
	for await (const doc of authors.find({}, { projection: { asin: 1, name: 1, aliases: 1 } })) {
		authorRows.push({ asin: doc.asin, name: doc.name, aliases: doc.aliases })
	}
	return { books: sampledBooks, authors: authorRows }
}

// Shape of the raw Audible catalog authors (subset)
interface RawAuthor {
	asin?: string
	name?: string
}
interface RawProduct {
	product?: {
		authors?: RawAuthor[]
	}
}

/**
 * Extracts the raw author entries (name + ASIN exactly as Audible sent
 * them, BEFORE any local enrichment) from a raw catalog response.
 * Audible's catalog API wraps the product: `{ product: { authors: [...] },
 * response_groups: [...] }` (see AudibleProductSchema); each author entry
 * carries `asin` (the same field the API maps to author.asin) and `name`.
 * Entries without an asin are kept as-is — that omission is what the
 * coverage report measures.
 */
export function extractRawAuthorEntries(raw: RawProduct): BookAuthorEntry[] {
	const entries: BookAuthorEntry[] = []
	for (const author of raw.product?.authors ?? []) {
		if (!author.name) continue
		entries.push({ asin: author.asin, name: author.name })
	}
	return entries
}

/**
 * The raw catalog response shape the fetch implementation must provide:
 * `status`/`ok` so HTTP error responses (404/429 — fetch() resolves for
 * those) can be rejected before their bodies are parsed as products.
 */
export interface RawFetchResponse {
	status: number
	ok: boolean
	json: () => Promise<RawProduct>
}

/**
 * Fetches the raw catalog product for a book and returns its raw author
 * entries. Injectable fetch keeps this testable without network.
 *
 * A non-2xx status is a failed fetch (fetch() resolves for 404/429 too,
 * and their bodies must not be parsed as products): the caller counts the
 * book as excluded, never as fetched.
 */
export async function fetchRawAuthorEntries(
	fetchImpl: (url: string) => Promise<RawFetchResponse>,
	asin: string,
	region: string
): Promise<BookAuthorEntry[]> {
	const tld = regions[region].tld
	const url = `https://api.audible.${tld}/1.0/catalog/products/${asin}?response_groups=contributors`
	const response = await fetchImpl(url)
	if (!response.ok) {
		throw new Error(`Raw catalog fetch for ${asin} failed with status ${response.status}`)
	}
	const raw = await response.json()
	return extractRawAuthorEntries(raw)
}

/**
 * Replaces each sampled book's stored (possibly enriched) author entries
 * with the raw Audible author entries, measured per region. Books whose raw
 * response cannot be fetched are excluded from measurement (their stats are
 * not counted) so the report reflects raw Audible data only. Bounded
 * concurrency keeps the request rate gentle on the Audible API.
 */
export async function measureRawEntries(
	books: BookRow[],
	fetchImpl: (url: string) => Promise<RawFetchResponse>,
	concurrency = RAW_FETCH_CONCURRENCY
): Promise<{ books: BookRow[]; fetched: number; excluded: number }> {
	const measured: BookRow[] = []
	let fetched = 0
	let excluded = 0
	let index = 0
	const worker = async () => {
		while (index < books.length) {
			const book = books[index]
			index += 1
			try {
				const authors = await fetchRawAuthorEntries(fetchImpl, book.asin, book.region)
				measured.push({ ...book, authors })
				fetched += 1
			} catch {
				excluded += 1
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, books.length) }, () => worker()))
	return { books: measured, fetched, excluded }
}

/**
 * Derives per-region raw fetch/exclusion counts. `measureRawEntries` drops
 * failed fetches from `fetched` (it only returns successfully measured
 * books), so a region's exclusions are its sampled books minus the fetched
 * ones — not a separately incremented counter. `fetchedBooks` are the
 * successfully measured subset of `sampledBooks`.
 */
export function computeRegionRawCounts(
	sampledBooks: BookRow[],
	fetchedBooks: BookRow[]
): Record<string, { rawFetched: number; rawExcluded: number }> {
	const counts: Record<string, { sampled: number; fetched: number }> = {}
	for (const region of SAMPLED_REGIONS) counts[region] = { sampled: 0, fetched: 0 }
	for (const book of sampledBooks) counts[book.region].sampled += 1
	for (const book of fetchedBooks) {
		counts[book.region].fetched += 1
	}
	const result: Record<string, { rawFetched: number; rawExcluded: number }> = {}
	for (const region of SAMPLED_REGIONS) {
		result[region] = {
			rawFetched: counts[region].fetched,
			rawExcluded: counts[region].sampled - counts[region].fetched
		}
	}
	return result
}

/**
 * Assembles the final coverage report from the measurement results. The
 * per-region raw counts come from `computeRegionRawCounts` (exclusions are
 * sampled minus fetched per region); the total raw counts come directly from
 * the raw measurement pass.
 */
export function assembleCoverageReport({
	date,
	sampleSize,
	windowDays,
	sampledBooks,
	raw,
	authors
}: {
	date: string
	sampleSize: number
	windowDays: number
	sampledBooks: BookRow[]
	raw: { books: BookRow[]; fetched: number; excluded: number }
	authors: AuthorRow[]
}): CoverageReport {
	const regionRawCounts = computeRegionRawCounts(sampledBooks, raw.books)
	const { regions, total } = measureCoverage(raw.books, buildNameAsinMap(authors))
	for (const region of SAMPLED_REGIONS) {
		regions[region].rawFetched = regionRawCounts[region].rawFetched
		regions[region].rawExcluded = regionRawCounts[region].rawExcluded
	}
	total.rawFetched = raw.fetched
	total.rawExcluded = raw.excluded
	return { date, sampleSize, windowDays, regions, total }
}

const main = async () => {
	const uri = process.env.MONGODB_URI
	if (!uri) {
		console.error('Missing environment variable(s): MONGODB_URI')
		process.exit(1)
	}
	const sampleSize = parseSampleSize(process.argv.slice(2))
	const windowDays = parseWindowDays(process.argv.slice(2))

	const client = new MongoClient(uri)
	try {
		await client.connect()
		const db = client.db('audnexus')
		const { books, authors } = await collectData(
			db.collection('books') as unknown as BookCollectionLike,
			db.collection('authors') as unknown as AuthorCollectionLike,
			sampleSize,
			windowDays
		)
		const raw = await measureRawEntries(books, (url) =>
			// A stalled catalog response must not wedge a worker forever:
			// the timeout rejects and the book is counted as excluded.
			fetch(url, { signal: AbortSignal.timeout(RAW_FETCH_TIMEOUT_MS) })
		)
		const report = assembleCoverageReport({
			date: new Date().toISOString().slice(0, 10),
			sampleSize,
			windowDays,
			sampledBooks: books,
			raw,
			authors
		})
		console.log(formatReport(report))
		mkdirSync('reports', { recursive: true })
		const file = `reports/author-asin-coverage-${report.date}.json`
		writeFileSync(file, `${JSON.stringify(report, null, '\t')}\n`)
		console.log(`\nReport written to ${file}`)
	} finally {
		await client.close()
	}
}

// Run only when executed directly, not when imported by tests
if (import.meta.main) {
	main().catch((error: unknown) => {
		console.error(`An error occurred while measuring author ASIN coverage: ${String(error)}`)
		process.exit(1)
	})
}
