import { describe, expect, test } from 'bun:test'

import {
	assembleCoverageReport,
	type AuthorRow,
	type BookAuthorEntry,
	type BookCollectionLike,
	type BookRow,
	buildNameAsinMap,
	collectData,
	computeRegionRawCounts,
	extractRawAuthorEntries,
	fetchRawAuthorEntries,
	formatReport,
	measureCoverage,
	measureRawEntries
} from '../../scripts/measure-author-asin-coverage'

import { foldName } from '#helpers/utils/foldName'

const authors: AuthorRow[] = [
	// Unique, resolvable author (present per region row, folds to one ASIN)
	{ asin: 'B001', name: 'Jane Doe' },
	// Homonym: two distinct ASINs share a folded name
	{ asin: 'B002', name: 'Mark Davis' },
	{ asin: 'B003', name: 'Mark Davis' }
]

const nameMap = buildNameAsinMap(authors)

describe('foldName', () => {
	test('folds case and whitespace', () => {
		expect(foldName('  JANE   Doe \n')).toBe('jane doe')
	})
})

describe('buildNameAsinMap', () => {
	test('collapses folded duplicates into one ASIN set', () => {
		const rows: AuthorRow[] = [
			{ asin: 'B001', name: 'Jane Doe' },
			{ asin: 'B001', name: 'jane  doe' }
		]
		const map = buildNameAsinMap(rows)
		expect(map.get('jane doe')).toEqual(new Set(['B001']))
	})
	test('keeps distinct ASINs for homonyms', () => {
		expect(nameMap.get('mark davis')).toEqual(new Set(['B002', 'B003']))
	})
	test('includes aliases in the map', () => {
		const withAliases: AuthorRow[] = [
			{ asin: 'B009', name: 'Kazuo Ishiguro', aliases: ['K. Ishiguro'] }
		]
		const map = buildNameAsinMap(withAliases)
		expect(map.get('k. ishiguro')).toEqual(new Set(['B009']))
		expect(map.get('kazuo ishiguro')).toEqual(new Set(['B009']))
	})
	test('an alias colliding with another author makes that name ambiguous', () => {
		const colliding: AuthorRow[] = [
			{ asin: 'B010', name: 'Nick Cole Jr.', aliases: ['nick cole'] },
			{ asin: 'B011', name: 'Nick Cole' }
		]
		const map = buildNameAsinMap(colliding)
		expect(map.get('nick cole')).toEqual(new Set(['B010', 'B011']))
	})
})

describe('measureCoverage', () => {
	test('measures omission among matches vs non-matches, homonyms, and unknown authors', () => {
		const books: BookRow[] = [
			{
				asin: 'B0K1',
				region: 'us',
				authors: [
					// Known author, ASIN present
					{ asin: 'B001', name: 'Jane Doe' },
					// Known author, ASIN omitted (the actionable omission)
					{ name: 'Jane Doe' },
					// Homonym, ASIN omitted
					{ name: 'Mark Davis' },
					// Not in authors collection, ASIN omitted
					{ name: 'Nobody Nowhere' }
				]
			},
			{
				asin: 'B0K2',
				region: 'uk',
				authors: [
					// Folded-name match with ASIN present
					{ asin: 'B001', name: '  jane  doe ' }
				]
			},
			{
				asin: 'B0K3',
				region: 'de',
				authors: [
					// Not in authors, ASIN present
					{ asin: 'B999', name: 'Unknown Person' }
				]
			}
		]

		const { regions, total } = measureCoverage(books, nameMap)

		const us = regions.us
		expect(us.books).toBe(1)
		expect(us.authorEntries).toBe(4)
		expect(us.asinMissing).toBe(3)
		expect(us.omissionRate).toBeCloseTo(0.75)
		expect(us.nameMatched).toBe(3)
		expect(us.missingAmongMatched).toBe(2)
		expect(us.omissionRateAmongMatches).toBeCloseTo(2 / 3)
		expect(us.notInAuthors).toBe(1)
		expect(us.omissionRateAmongNonMatches).toBeCloseTo(1)
		expect(us.homonymAmbiguous).toBe(1)

		// uk: folded-name match, no omission
		expect(regions.uk.nameMatched).toBe(1)
		expect(regions.uk.omissionRateAmongMatches).toBe(0)

		// de: non-match with ASIN present
		expect(regions.de.notInAuthors).toBe(1)
		expect(regions.de.omissionRateAmongNonMatches).toBe(0)

		// Regions with no sampled books report zeros, not NaN
		expect(regions.au.authorEntries).toBe(0)
		expect(regions.au.omissionRate).toBe(0)

		expect(total.authorEntries).toBe(6)
		expect(total.asinMissing).toBe(3)
		expect(total.nameMatched).toBe(4)
		expect(total.omissionRateAmongMatches).toBeCloseTo(0.5)
		expect(total.notInAuthors).toBe(2)
		expect(total.omissionRateAmongNonMatches).toBeCloseTo(0.5)
		expect(total.homonymAmbiguous).toBe(1)
	})

	test('formatReport renders all sampled regions and a total row', () => {
		const { regions, total } = measureCoverage(
			[
				{ asin: 'B0K1', region: 'us', authors: [{ name: 'Jane Doe' }] },
				{ asin: 'B0K2', region: 'ca', authors: [{ asin: 'B001', name: 'Jane Doe' }] }
			],
			nameMap
		)
		const output = formatReport({
			date: '2026-10-14',
			sampleSize: 500,
			windowDays: 90,
			regions,
			total
		})
		for (const region of ['us', 'uk', 'de', 'au', 'ca']) expect(output).toContain(region)
		expect(output).toContain('TOTAL')
		expect(output).toContain('2026-10-14')
		// Title says the metric measures Audible's raw responses
		expect(output).toContain('Author ASIN coverage in Audible raw responses')
		// Both the match and the non-match omission rates are in the header
		expect(output).toContain('missingAmongMatches(%)')
		expect(output).toContain('missingAmongNonMatches(%)')
	})
})

describe('extractRawAuthorEntries', () => {
	test('keeps author-role contributors, drops other roles and unnamed entries', () => {
		const entries = extractRawAuthorEntries({
			contributors: [
				{ id: 'B001', name: 'Jane Doe', role: 'author' },
				{ id: 'B777', name: 'Some Narrator', role: 'narrator' },
				{ id: 'B002', name: 'Mark Davis', role: 'author' },
				{ id: 'B778', name: undefined, role: 'author' }
			]
		})
		expect(entries).toEqual([
			{ asin: 'B001', name: 'Jane Doe' },
			{ asin: 'B002', name: 'Mark Davis' }
		])
	})
	test('returns empty for a response without contributors', () => {
		expect(extractRawAuthorEntries({})).toEqual([])
	})
})

describe('fetchRawAuthorEntries', () => {
	test('fetches the catalog product for the book asin and region tld', async () => {
		const urls: string[] = []
		const fetchImpl = async (url: string) => {
			urls.push(url)
			return {
				status: 200,
				ok: true,
				json: async () => ({
					contributors: [{ id: 'B001', name: 'Jane Doe', role: 'author' }]
				})
			}
		}
		const entries = await fetchRawAuthorEntries(fetchImpl, 'B0K1', 'uk')
		expect(urls).toEqual([
			'https://api.audible.co.uk/1.0/catalog/products/B0K1?response_groups=contributors'
		])
		expect(entries).toEqual([{ asin: 'B001', name: 'Jane Doe' }])
	})

	test('treats a non-2xx response with a JSON body as a failed fetch', async () => {
		// Audible's 404/429 responses resolve (fetch does not throw) and
		// carry a JSON error body; it must not be parsed as a product
		const fetchImpl = async () => ({
			status: 404,
			ok: false,
			json: async () => ({
				contributors: [{ id: 'B001', name: 'Jane Doe', role: 'author' }]
			})
		})
		await expect(fetchRawAuthorEntries(fetchImpl, 'B0K1', 'us')).rejects.toThrow(
			'status 404'
		)
	})

	test('a 429 rate-limit response is a failed fetch', async () => {
		const fetchImpl = async () => ({
			status: 429,
			ok: false,
			json: async () => ({})
		})
		await expect(fetchRawAuthorEntries(fetchImpl, 'B0K1', 'us')).rejects.toThrow(
			'status 429'
		)
	})
})

describe('measureRawEntries', () => {
	const rawOf = (name: string, asin?: string) => ({
		contributors: [{ id: asin, name, role: 'author' }]
	})

	test('replaces stored entries with raw ones and counts fetched', async () => {
		const books: BookRow[] = [
			// Stored entry is the enriched view; raw response omits the ASIN
			{ asin: 'B0K1', region: 'us', authors: [{ asin: 'B001', name: 'Jane Doe' }] },
			{ asin: 'B0K2', region: 'uk', authors: [] }
		]
		const urls: string[] = []
		const fetchImpl = async (url: string) => {
			urls.push(url)
			return { status: 200, ok: true, json: async () => rawOf('Jane Doe') }
		}
		const result = await measureRawEntries(books, fetchImpl)
		expect(result.fetched).toBe(2)
		expect(result.excluded).toBe(0)
		expect(result.books).toEqual([
			{ asin: 'B0K1', region: 'us', authors: [{ name: 'Jane Doe' }] },
			{ asin: 'B0K2', region: 'uk', authors: [{ name: 'Jane Doe' }] }
		])
		// Each book is fetched against its own region's API
		expect(urls).toEqual([
			'https://api.audible.com/1.0/catalog/products/B0K1?response_groups=contributors',
			'https://api.audible.co.uk/1.0/catalog/products/B0K2?response_groups=contributors'
		])
	})

	test('excludes books whose raw fetch fails and measures the rest', async () => {
		const books: BookRow[] = [
			{ asin: 'B0K1', region: 'us', authors: [] },
			{ asin: 'B0K2', region: 'us', authors: [] },
			{ asin: 'B0K3', region: 'us', authors: [] }
		]
		const fetchImpl = async (url: string) => {
			if (url.includes('B0K2')) throw new Error('http 503')
			return { status: 200, ok: true, json: async () => rawOf('Jane Doe') }
		}
		const result = await measureRawEntries(books, fetchImpl)
		expect(result.fetched).toBe(2)
		expect(result.excluded).toBe(1)
		expect(result.books.map((book) => book.asin)).toEqual(['B0K1', 'B0K3'])
	})

	test('respects the concurrency limit', async () => {
		const books: BookRow[] = Array.from({ length: 5 }, (_, i) => ({
			asin: `B0K${i}`,
			region: 'us',
			authors: [] as BookAuthorEntry[]
		}))
		let inFlight = 0
		let maxInFlight = 0
		const fetchImpl = async () => {
			inFlight += 1
			maxInFlight = Math.max(maxInFlight, inFlight)
			// Let the other in-flight request start before completing
			await Promise.resolve()
			inFlight -= 1
			return { status: 200, ok: true, json: async () => rawOf('Jane Doe') }
		}
		const result = await measureRawEntries(books, fetchImpl, 2)
		expect(result.fetched).toBe(5)
		expect(maxInFlight).toBeLessThanOrEqual(2)
	})
})

describe('computeRegionRawCounts', () => {
	test('derives per-region exclusions from sampled minus fetched', () => {
		// uk had 3 sampled books, one of which failed to fetch
		const sampled: BookRow[] = [
			{ asin: 'B0K1', region: 'us', authors: [] },
			{ asin: 'B0K2', region: 'us', authors: [] },
			{ asin: 'B0K3', region: 'uk', authors: [] },
			{ asin: 'B0K4', region: 'uk', authors: [] },
			{ asin: 'B0K5', region: 'uk', authors: [] }
		]
		const fetched = sampled.filter((book) => book.asin !== 'B0K4')
		expect(computeRegionRawCounts(sampled, fetched)).toEqual({
			us: { rawFetched: 2, rawExcluded: 0 },
			uk: { rawFetched: 2, rawExcluded: 1 },
			de: { rawFetched: 0, rawExcluded: 0 },
			au: { rawFetched: 0, rawExcluded: 0 },
			ca: { rawFetched: 0, rawExcluded: 0 }
		})
	})

	test('reports zero exclusions when every sampled book fetched', () => {
		const books: BookRow[] = [
			{ asin: 'B0K1', region: 'de', authors: [] },
			{ asin: 'B0K2', region: 'de', authors: [] }
		]
		expect(computeRegionRawCounts(books, books)).toMatchObject({
			de: { rawFetched: 2, rawExcluded: 0 },
			au: { rawFetched: 0, rawExcluded: 0 }
		})
	})
})

describe('assembleCoverageReport', () => {
	test('writes per-region and total raw fetch exclusions to the report', () => {
		// us: 3 sampled, one non-2xx; de: 1 sampled, fetched
		const sampled: BookRow[] = [
			{ asin: 'B0K1', region: 'us', authors: [{ name: 'Jane Doe' }] },
			{ asin: 'B0K2', region: 'us', authors: [{ name: 'Jane Doe' }] },
			{ asin: 'B0K3', region: 'us', authors: [{ name: 'Jane Doe' }] },
			{ asin: 'B0K4', region: 'de', authors: [{ name: 'Jane Doe' }] }
		]
		const raw = {
			books: [sampled[0], sampled[1], sampled[3]],
			fetched: 3,
			excluded: 1
		}
		const report = assembleCoverageReport({
			date: '2026-10-15',
			sampleSize: 2,
			windowDays: 90,
			sampledBooks: sampled,
			raw,
			authors: [{ asin: 'B001', name: 'Jane Doe' }]
		})
		expect(report.regions.us).toMatchObject({ rawFetched: 2, rawExcluded: 1 })
		expect(report.regions.de).toMatchObject({ rawFetched: 1, rawExcluded: 0 })
		expect(report.regions.uk).toMatchObject({ rawFetched: 0, rawExcluded: 0 })
		expect(report.total.rawFetched).toBe(3)
		expect(report.total.rawExcluded).toBe(1)
	})
})

describe('collectData', () => {
	// Pipelines are opaque mongodb shapes; this guard validates before reads
	const matchOf = (pipeline: Record<string, unknown>[]): Record<string, unknown> => {
		const first = pipeline[0]
		if (typeof first !== 'object' || first === null || !('$match' in first)) {
			throw new Error('expected a $match stage')
		}
		const match = first.$match
		if (typeof match !== 'object' || match === null) {
			throw new Error('expected a $match object')
		}
		// Structurally identical to Record<string, unknown>; inference cannot express that
		return match as Record<string, unknown>
	}

	const makeBookCollection = (
		docs: (Omit<BookRow, 'region'> & { region?: string })[]
	): {
		collection: BookCollectionLike
		pipelines: Record<string, unknown>[][]
	} => {
		const pipelines: Record<string, unknown>[][] = []
		const collection: BookCollectionLike = {
			aggregate: (pipeline: Record<string, unknown>[]) => {
				pipelines.push(pipeline)
				const regionMatch = matchOf(pipeline).region
				const matching = regionMatch
					? docs.filter((doc) => {
							if (typeof regionMatch === 'object' && regionMatch !== null && '$in' in regionMatch) {
								const values = regionMatch.$in
								return Array.isArray(values) && values.includes(doc.region ?? null)
							}
							return doc.region === regionMatch
						})
					: docs
				return (async function* () {
					// Fake collection; regionless docs stand in for legacy books
					yield* matching as BookRow[]
				})()
			}
		}
		return { collection, pipelines }
	}

	const makeAuthorsCollection = (rows: AuthorRow[]) => ({
		find: async function* (): AsyncIterableIterator<AuthorRow> {
			yield* rows
		}
	})

	test('restricts each region to a createdAt window when windowDays > 0', async () => {
		const { collection, pipelines } = makeBookCollection([])
		await collectData(collection, makeAuthorsCollection([]), 500, 90)

		expect(pipelines).toHaveLength(5)
		// Window starts roughly 90 days ago
		const createdAt = matchOf(pipelines[0]).createdAt
		if (typeof createdAt !== 'object' || createdAt === null || !('$gte' in createdAt)) {
			throw new Error('expected a $gte createdAt filter')
		}
		const start = createdAt.$gte
		if (!(start instanceof Date)) throw new Error('expected a Date window start')
		expect(Date.now() - start.getTime()).toBeLessThanOrEqual(90 * 86_400_000 + 1000)
	})

	test('omits the createdAt filter when windowDays is 0 (all-time)', async () => {
		const { collection, pipelines } = makeBookCollection([])
		await collectData(collection, makeAuthorsCollection([]), 500, 0)

		for (const pipeline of pipelines) {
			expect(matchOf(pipeline).createdAt).toBeUndefined()
		}
	})

	test('includes legacy regionless books in the US sample only', async () => {
		const { collection, pipelines } = makeBookCollection([])
		await collectData(collection, makeAuthorsCollection([]), 500, 0)

		const [us, uk, de, au, ca] = pipelines
		expect(matchOf(us).region).toEqual({ $in: ['us', null] })
		expect(matchOf(uk).region).toBe('uk')
		expect(matchOf(de).region).toBe('de')
		expect(matchOf(au).region).toBe('au')
		expect(matchOf(ca).region).toBe('ca')
	})

	test('buckets regionless sampled docs into the US stats', async () => {
		const { collection } = makeBookCollection([
			{ asin: 'B0K1', region: 'us', authors: [{ name: 'Jane Doe' }] },
			// Legacy book stored without a region field
			{ asin: 'B0K2', authors: [{ name: 'Jane Doe' }] }
		])
		const { books } = await collectData(collection, makeAuthorsCollection([]), 500, 0)
		expect(books.map((b) => b.region)).toEqual(['us', 'us'])
	})

	test('projects asin, name, and aliases from the authors collection', async () => {
		const { collection } = makeBookCollection([])
		let seenFilter: Record<string, unknown> | undefined
		let seenOptions: { projection: Record<string, 1> } | undefined
		const authors = {
			find: (filter: Record<string, unknown>, options: { projection: Record<string, 1> }) => {
				seenFilter = filter
				seenOptions = options
				return (async function* (): AsyncIterableIterator<AuthorRow> {
					yield { asin: 'B001', name: 'Jane Doe', aliases: ['JD'] }
				})()
			}
		}
		const { authors: rows } = await collectData(collection, authors, 500, 0)
		expect(seenFilter).toEqual({})
		expect(seenOptions).toEqual({ projection: { asin: 1, name: 1, aliases: 1 } })
		expect(rows).toEqual([{ asin: 'B001', name: 'Jane Doe', aliases: ['JD'] }])
	})
})
