// Pure evidence-to-observation construction for the book history feature.
//
// Source rules:
// - Zod-valid own keys count as evidence; `response_groups` is provenance,
//   not a field-deletion oracle.
// - Unknown evidence is an omitted observation, never an absent envelope and
//   never a JSON null.
// - Present empty strings/lists and 0 are actual values; missing input
//   remains unknown despite ''/[]/0 in the public projection.
// - Ratings and the projected `image` field never enter observations.

import type { z } from 'zod'

import type {
	ArtworkReference,
	BookObservation,
	FieldObservation,
	HistoryValue,
	JsonValue
} from '#config/bookHistory'
import {
	EDITORIAL_FIELD_POLICIES,
	GENRES_API_POLICY,
	GENRES_HTML_POLICY,
	RELEASE_DATE_ISSUE_POLICY,
	RELEASE_DATE_RELEASE_POLICY
} from '#config/bookHistory'
import type { ApiBook, ApiGenre, AudibleSeries, baseShape } from '#config/types'

/**
 * The raw own product shape (base, pre-fallback), extended with the
 * series-only keys from book-shaped content. Used for key-presence evidence.
 */
export type RawProduct = z.infer<typeof baseShape> & {
	series?: AudibleSeries[]
}

/** Content delivery types for which series mapping applies. */
const BOOK_SERIES_CONTENT_TYPES: readonly string[] = ['MultiPartBook', 'SinglePartBook']

/** Exact allowed artwork hosts. Other Amazon hosts are not comparable. */
const ARTWORK_HOSTS: readonly string[] = ['m.media-amazon.com', 'images-na.ssl-images-amazon.com']

const ARTWORK_PATH_RE = /^\/images\/I\/([A-Za-z0-9+_-]+)(?:\.[A-Za-z0-9_.]+)*\.(jpg|jpeg|png|webp)$/

/**
 * Extract the Amazon asset ID from a returned product image URL, or null
 * when the URL does not match the recognized form.
 *
 * Recognized: HTTP(S), no credentials, exact allowed host, `/images/I/`
 * path, ASCII `[A-Za-z0-9+-]+` asset ID, an optional Amazon `._…`
 * transformation segment without slash, and a `.jpg`/`.jpeg`/`.png`/`.webp`
 * extension. The ID is captured before the transformation segment; a plain
 * `<id>.jpg` is recognized. Query/fragment/extension/recognized-host/
 * transform differences do not enter ID equality. Anything else returns null
 * while the exact URL is retained as an unparsed reference — never split an
 * arbitrary URL at its first dot.
 */
export function parseArtworkReference(url: string): string | null {
	let parsed: URL
	try {
		parsed = new URL(url)
	} catch {
		return null
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
	if (parsed.username !== '' || parsed.password !== '') return null
	if (!ARTWORK_HOSTS.includes(parsed.hostname)) return null
	return parsed.pathname.match(ARTWORK_PATH_RE)?.[1] ?? null
}

const asValue = (v: JsonValue): HistoryValue => ({ state: 'value', value: v })
const ABSENT: HistoryValue = { state: 'absent' }

/**
 * Canonicalize history genres for comparison/storage only: deduplicate and
 * sort the `(type, asin, name)` tuples. Does not reorder the current public
 * response.
 */
export function canonicalGenres(genres: ApiGenre[]): JsonValue {
	const tuples = genres
		.map((g) => ({
			key: `${g.type}\u0000${g.asin}\u0000${g.name}`,
			value: [g.type, g.asin, g.name]
		}))
		.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
	const seen = new Set<string>()
	const result: JsonValue[] = []
	for (const tuple of tuples) {
		if (!seen.has(tuple.key)) {
			seen.add(tuple.key)
			result.push(tuple.value)
		}
	}
	return result
}

/** Outcome of the mapper's series selection for a book-shaped product. */
export type SeriesOutcome = 'unavailable' | 'selected' | 'absent' | 'failed'

/**
 * Everything the evidence builder needs. `book` is the final validated
 * mapping (mapped values), `product` is the raw own product (key-presence
 * evidence), and the remaining inputs are the mapper side values the
 * builder cannot re-derive after `getGenres()` mutates the ladders.
 */
export interface ObservationInputs {
	book: ApiBook
	product: RawProduct
	/** Year extracted by the mapper's copyright helper, when extracted. */
	copyrightYear: number | undefined
	/** Nonempty mapped genres from the API path (empty when never mapped). */
	apiGenres: ApiGenre[]
	/** Which classification inputs justified the derived literature type. */
	literatureTypeJustified: boolean
	/** Raw `series` key present on a book-shaped content type. */
	seriesKeyPresent: boolean
	/** The mapper's series selection outcome. */
	seriesOutcome: SeriesOutcome
}

/**
 * Build the field observations from raw evidence under the per-field
 * policies. Order follows EDITORIAL_HISTORY_FIELDS.
 */
export function buildFieldObservations(input: ObservationInputs): FieldObservation[] {
	const {
		book,
		product,
		copyrightYear,
		apiGenres,
		literatureTypeJustified,
		seriesKeyPresent,
		seriesOutcome
	} = input
	const fields: FieldObservation[] = []
	const push = (
		field: FieldObservation['field'],
		policy: string,
		value: HistoryValue | undefined,
		source: 'audible_api' | 'audible_html' = 'audible_api'
	) => {
		if (value !== undefined) fields.push({ field, policy, value, source })
	}

	// Mapped-value fields: own Zod-valid keys always present
	const raw = product

	push('title', EDITORIAL_FIELD_POLICIES.title, asValue(book.title))
	if ('subtitle' in raw)
		push('subtitle', EDITORIAL_FIELD_POLICIES.subtitle, asValue(book.subtitle ?? ''))
	push('authors', EDITORIAL_FIELD_POLICIES.authors, asValue(book.authors))
	if ('narrators' in raw)
		push('narrators', EDITORIAL_FIELD_POLICIES.narrators, asValue(book.narrators ?? []))
	push('publisherName', EDITORIAL_FIELD_POLICIES.publisherName, asValue(book.publisherName))
	if ('merchandising_summary' in raw)
		push('description', EDITORIAL_FIELD_POLICIES.description, asValue(book.description))
	if ('publisher_summary' in raw)
		push('summary', EDITORIAL_FIELD_POLICIES.summary, asValue(book.summary))
	if ('isbn' in raw) push('isbn', EDITORIAL_FIELD_POLICIES.isbn, asValue(book.isbn ?? ''))
	push('language', EDITORIAL_FIELD_POLICIES.language, asValue(book.language))
	push('formatType', EDITORIAL_FIELD_POLICIES.formatType, asValue(book.formatType))
	if (raw.copyright && copyrightYear !== undefined) {
		push('copyright', EDITORIAL_FIELD_POLICIES.copyright, asValue(copyrightYear))
	}

	// Release date with the source-selected policy
	const tryDate = (dateString: string | undefined): string | null => {
		if (!dateString || typeof dateString !== 'string') return null
		const parsed = new Date(dateString)
		return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
	}
	const releaseIso = tryDate(raw.release_date)
	const issueIso = releaseIso ? null : tryDate(raw.issue_date)
	if (releaseIso) {
		push('releaseDate', RELEASE_DATE_RELEASE_POLICY, asValue(releaseIso))
	} else if (issueIso) {
		push('releaseDate', RELEASE_DATE_ISSUE_POLICY, asValue(issueIso))
	}

	if ('runtime_length_min' in raw)
		push(
			'runtimeLengthMin',
			EDITORIAL_FIELD_POLICIES.runtimeLengthMin,
			asValue(book.runtimeLengthMin)
		)

	// Series: key presence on book-shaped content; explicit [] is known-absent
	if (seriesKeyPresent) {
		if (seriesOutcome === 'selected') {
			push(
				'seriesPrimary',
				EDITORIAL_FIELD_POLICIES.seriesPrimary,
				asValue(book.seriesPrimary ?? null)
			)
			push(
				'seriesSecondary',
				EDITORIAL_FIELD_POLICIES.seriesSecondary,
				asValue(book.seriesSecondary ?? null)
			)
		} else if (seriesOutcome === 'absent') {
			push('seriesPrimary', EDITORIAL_FIELD_POLICIES.seriesPrimary, ABSENT)
			push('seriesSecondary', EDITORIAL_FIELD_POLICIES.seriesSecondary, ABSENT)
		}
	}

	// Genres: API-mapped, canonicalized (StitchHelper may supersede)
	if (apiGenres.length > 0) {
		push('genres', GENRES_API_POLICY, asValue(canonicalGenres(apiGenres)))
	}

	if (literatureTypeJustified && book.literatureType) {
		push('literatureType', EDITORIAL_FIELD_POLICIES.literatureType, asValue(book.literatureType))
	}

	push('isAdult', EDITORIAL_FIELD_POLICIES.isAdult, asValue(book.isAdult))

	return fields
}

/**
 * Build artwork references for every returned product_images entry,
 * including unknown URL forms (retained unparsed, not comparable).
 * Restricted to `product_images` — social sharing composites never enter.
 */
export function buildArtworkReferences(
	productImages: Record<string, string> | undefined
): ArtworkReference[] {
	if (!productImages) return []
	return Object.entries(productImages)
		.filter(([, sourceUrl]) => typeof sourceUrl === 'string' && sourceUrl.length > 0)
		.map(([rendition, sourceUrl]) => ({
			rendition,
			sourceUrl,
			imageId: parseArtworkReference(sourceUrl)
		}))
}

/** Which classification inputs justify a literature type value. */
export function isLiteratureTypeJustified(
	categoryLadders: { ladder: { id: string; name: string }[]; root: string }[] | undefined,
	thesaurusKeywords: string[] | undefined
): boolean {
	if (categoryLadders && categoryLadders.length > 0) return true
	return !!thesaurusKeywords && thesaurusKeywords.length > 0
}

/** Content type eligible for series mapping. */
export function isBookSeriesContentType(contentType: string | undefined): boolean {
	return (
		contentType !== undefined &&
		(BOOK_SERIES_CONTENT_TYPES as readonly string[]).includes(contentType)
	)
}

/** Series evidence: own key present on a book-shaped product + outcome. */
export function seriesEvidence(
	product: RawProduct,
	contentType: string | undefined,
	selected: boolean
): { present: boolean; outcome: SeriesOutcome } {
	if (!isBookSeriesContentType(contentType)) return { present: false, outcome: 'unavailable' }
	const raw = product
	if (!('series' in raw)) return { present: false, outcome: 'unavailable' }
	const series = raw.series
	if (!Array.isArray(series)) return { present: false, outcome: 'unavailable' }
	if (series.length === 0) return { present: true, outcome: 'absent' }
	return { present: true, outcome: selected ? 'selected' : 'failed' }
}

/** Compose the observation's timestamp fields. */
export function composeTimestamps(
	apiReceivedAt: Date,
	htmlReceivedAt?: Date
): {
	observedAt: Date
	apiReceivedAt: Date
	htmlReceivedAt?: Date
} {
	const hasHtml = htmlReceivedAt !== undefined
	return {
		observedAt: hasHtml ? htmlReceivedAt : apiReceivedAt,
		apiReceivedAt,
		...(hasHtml && { htmlReceivedAt })
	}
}

/** Replace/insert the genres field with the supplied (stitched) value. */
export function withGenresField(
	fields: FieldObservation[],
	genres: ApiGenre[],
	source: 'audible_api' | 'audible_html'
): FieldObservation[] {
	const policy = source === 'audible_html' ? GENRES_HTML_POLICY : GENRES_API_POLICY
	const rest = fields.filter((f) => f.field !== 'genres')
	if (genres.length === 0) return rest
	return [...rest, { field: 'genres', policy, value: asValue(canonicalGenres(genres)), source }]
}

/** Assemble a full observation from captured evidence. */
export function composeObservation(
	observation: Omit<BookObservation, 'fields' | 'artwork'>,
	fields: FieldObservation[],
	artwork: ArtworkReference[]
): BookObservation {
	return { ...observation, fields, artwork }
}
