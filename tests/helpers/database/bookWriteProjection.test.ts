import { describe, expect, test } from 'bun:test'

import { buildEffectiveWrite } from '#helpers/database/bookWriteProjection'

// The ratings fixtures mirror the persisted public shape (ApiBook): the
// stored row carries a full `ratings` block including Goodreads, and the
// incoming book is what the fresh API fetch produced.

const goodreads = { value: 4.2, numRatings: 4210 }

const baseBook = {
	asin: 'B079LRSMNN',
	authors: [{ name: 'Author' }],
	description: 'desc',
	formatType: 'unabridged',
	isAdult: false,
	language: 'english',
	publisherName: 'Publisher',
	region: 'us',
	releaseDate: new Date('2018-02-20T00:00:00.000Z'),
	runtimeLengthMin: 600,
	summary: 'summary',
	title: 'Title'
}

const incoming = (overrides: Record<string, unknown> = {}) =>
	({
		...baseBook,
		...overrides
	}) as Parameters<typeof buildEffectiveWrite>[1]

const stored = (overrides: Record<string, unknown> = {}) =>
	({
		...baseBook,
		...overrides
	}) as Parameters<typeof buildEffectiveWrite>[0]

describe('buildEffectiveWrite ratings.goodreads retention', () => {
	test('stored goodreads is retained when incoming ratings omits the key', () => {
		const { book } = buildEffectiveWrite(
			stored({
				ratings: {
					value: '4.5',
					numRatings: 200,
					numReviews: 10,
					distribution: { five: 100, four: 50, three: 20, two: 10, one: 20 },
					goodreads
				}
			}),
			incoming({
				ratings: {
					value: '4.6',
					numRatings: 210,
					numReviews: 11,
					distribution: { five: 101, four: 51, three: 21, two: 11, one: 26 }
				}
			}),
			{}
		)
		expect(book.ratings?.goodreads).toEqual(goodreads)
		// The rest of the incoming ratings block replaces the stored one.
		expect(book.ratings?.numRatings).toBe(210)
	})

	test('incoming goodreads replaces the stored value', () => {
		const { book } = buildEffectiveWrite(
			stored({
				ratings: {
					value: '4.5',
					numRatings: 200,
					numReviews: 10,
					distribution: { five: 100, four: 50, three: 20, two: 10, one: 20 },
					goodreads
				}
			}),
			incoming({
				ratings: {
					value: '4.6',
					numRatings: 210,
					numReviews: 11,
					distribution: { five: 101, four: 51, three: 21, two: 11, one: 26 },
					goodreads: { value: 4.4, numRatings: 5000 }
				}
			}),
			{}
		)
		expect(book.ratings?.goodreads).toEqual({ value: 4.4, numRatings: 5000 })
	})

	test('no incoming ratings at all: stored ratings are unchanged', () => {
		const storedRatings = {
			value: '4.5',
			numRatings: 200,
			numReviews: 10,
			distribution: { five: 100, four: 50, three: 20, two: 10, one: 20 },
			goodreads
		}
		const { book } = buildEffectiveWrite(
			stored({ ratings: storedRatings }),
			incoming({ title: 'New Title' }),
			{}
		)
		expect(book.ratings).toEqual(storedRatings)
		expect(book.title).toBe('New Title')
	})

	test('stored performance/story distributions are retained when incoming omits them', () => {
		// The dotted-path write preserves these stored sub-fields, so the
		// effective write must carry them forward too: an identical refresh
		// must compare equal, not rewrite the same values.
		const performance = { five: 90, four: 8, three: 1, two: 0, one: 1 }
		const story = { five: 85, four: 12, three: 2, two: 0, one: 1 }
		const { book } = buildEffectiveWrite(
			stored({
				ratings: {
					value: '4.5',
					numRatings: 200,
					numReviews: 10,
					performanceDistribution: performance,
					storyDistribution: story
				}
			}),
			incoming({
				ratings: { value: '4.5', numRatings: 200, numReviews: 10 }
			}),
			{}
		)
		expect(book.ratings?.performanceDistribution).toEqual(performance)
		expect(book.ratings?.storyDistribution).toEqual(story)
	})
})
