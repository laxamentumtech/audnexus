// Measure how often Audible omits the author ASIN on book listings, per region,
// and how that omission rate splits between author names that resolve (case/
// whitespace-folded) into the `authors` collection versus names that don't.
//
// Usage:
//   MONGODB_URI=mongodb://... bun run scripts/measure-author-asin-coverage.ts [--sample N] [--days N]
//
// Read-only: samples N books (default 500) per region via $sample, restricted
// to books created within the last N days (default 90; --days 0 = all-time),
// and loads the `authors` collection into an in-memory name -> ASIN map (122k
// ASINs is fine in RAM). The US sample includes legacy regionless books.

import { MongoClient } from 'mongodb'
import { mkdirSync, writeFileSync } from 'node:fs'

// Regions to measure (subset of the full region list)
const SAMPLED_REGIONS = ['us', 'uk', 'de', 'au', 'ca'] as const

const DEFAULT_SAMPLE_SIZE = 500
const DEFAULT_WINDOW_DAYS = 90
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
	region?: string
}

export interface RegionStats {
	books: number
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

// Case/whitespace fold per the investigation doc (name drift)
export const foldName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

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
		'region  books  entries  missing(%)  missingAmongMatches(%)  matches  notInAuthors  ambiguous'
	const window =
		report.windowDays === 0 ? 'all-time' : `created within the last ${report.windowDays} days`
	const lines: string[] = [
		`Author ASIN coverage measurement — ${report.date} (sample ${report.sampleSize}/region, ${window})`,
		'',
		header
	]
	const row = (label: string, s: RegionStats) =>
		`${label.padEnd(6)}  ${String(s.books).padStart(5)}  ${String(s.authorEntries).padStart(7)}  ${pct(
			s.omissionRate
		).padStart(11)}  ${pct(s.omissionRateAmongMatches).padStart(24)}  ${String(
			s.nameMatched
		).padStart(
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
		authorRows.push({ asin: doc.asin, name: doc.name, aliases: doc.aliases, region: doc.region })
	}
	return { books: sampledBooks, authors: authorRows }
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
		const date = new Date().toISOString().slice(0, 10)
		const { regions, total } = measureCoverage(books, buildNameAsinMap(authors))
		const report: CoverageReport = { date, sampleSize, windowDays, regions, total }
		console.log(formatReport(report))
		mkdirSync('reports', { recursive: true })
		const file = `reports/author-asin-coverage-${date}.json`
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
