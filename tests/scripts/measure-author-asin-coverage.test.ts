import { describe, expect, test } from 'bun:test'

import {
	type AuthorRow,
	type BookCollectionLike,
	type BookRow,
	buildNameAsinMap,
	collectData,
	foldName,
	formatReport,
	measureCoverage
} from '../../scripts/measure-author-asin-coverage'

const authors: AuthorRow[] = [
	// Unique, resolvable author (present per region row, folds to one ASIN)
	{ asin: 'B001', name: 'Jane Doe', region: 'us' },
	{ asin: 'B001', name: 'jane  doe', region: 'uk' },
	// Homonym: two distinct ASINs share a folded name
	{ asin: 'B002', name: 'Mark Davis', region: 'us' },
	{ asin: 'B003', name: 'Mark Davis', region: 'de' },
	// Drifted spelling of B001: case/whitespace fold collapses it
	{ asin: 'B001', name: 'JANE DOE', region: 'au' }
]

const nameMap = buildNameAsinMap(authors)

describe('foldName', () => {
	test('folds case and whitespace', () => {
		expect(foldName('  JANE   Doe \n')).toBe('jane doe')
	})
})

describe('buildNameAsinMap', () => {
	test('collapses folded duplicates into one ASIN set', () => {
		expect(nameMap.get('jane doe')).toEqual(new Set(['B001']))
	})
	test('keeps distinct ASINs for homonyms', () => {
		expect(nameMap.get('mark davis')).toEqual(new Set(['B002', 'B003']))
	})
	test('includes aliases in the map', () => {
		const withAliases: AuthorRow[] = [
			{ asin: 'B009', name: 'Kazuo Ishiguro', aliases: ['K. Ishiguro'], region: 'us' }
		]
		const map = buildNameAsinMap(withAliases)
		expect(map.get('k. ishiguro')).toEqual(new Set(['B009']))
		expect(map.get('kazuo ishiguro')).toEqual(new Set(['B009']))
	})
	test('an alias colliding with another author makes that name ambiguous', () => {
		const colliding: AuthorRow[] = [
			{ asin: 'B010', name: 'Nick Cole Jr.', aliases: ['nick cole'], region: 'us' },
			{ asin: 'B011', name: 'Nick Cole', region: 'us' }
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

	const emptyAuthors = { find: async function* (): AsyncIterableIterator<AuthorRow> {} }

	test('restricts each region to a createdAt window when windowDays > 0', async () => {
		const { collection, pipelines } = makeBookCollection([])
		await collectData(collection, emptyAuthors, 500, 90)

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
		await collectData(collection, emptyAuthors, 500, 0)

		for (const pipeline of pipelines) {
			expect(matchOf(pipeline).createdAt).toBeUndefined()
		}
	})

	test('includes legacy regionless books in the US sample only', async () => {
		const { collection, pipelines } = makeBookCollection([])
		await collectData(collection, emptyAuthors, 500, 0)

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
		const { books } = await collectData(collection, emptyAuthors, 500, 0)
		expect(books.map((b) => b.region)).toEqual(['us', 'us'])
	})
})
