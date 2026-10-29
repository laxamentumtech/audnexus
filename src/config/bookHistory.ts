// Shared constants, types, and Zod validators for the observed Audible
// metadata and artwork history feature (canonical slug: audible-history).
//
// History is source-observation history: per-field, per-rendition baselines
// initialized from fresh accepted source observations, with deltas stored as
// immutable revisions. Ratings and the projected `image` field are never
// tracked. Retained image references are URL/ID references only; no image
// bytes are ever stored.

import { z } from 'zod'

import { RegionSchema } from '#config/types'
import { LITERATURE_TYPE_POLICY } from '#helpers/books/audible/literatureType'
import { HISTORY_CURSOR_MAX_LENGTH } from '#helpers/books/historyCursor'

/**
 * The tracked editorial fields, in canonical order. `HISTORY_FIELDS` is this
 * list plus `artwork`. No other field is automatically eligible for history.
 * In particular, neither `rating` nor `ratings` enters values,
 * changed-field lists, or mixed-change revisions, and the projected `image`
 * is not tracked a second time.
 */
export const EDITORIAL_HISTORY_FIELDS = [
	'title',
	'subtitle',
	'authors',
	'narrators',
	'publisherName',
	'description',
	'summary',
	'isbn',
	'language',
	'formatType',
	'copyright',
	'releaseDate',
	'runtimeLengthMin',
	'seriesPrimary',
	'seriesSecondary',
	'genres',
	'literatureType',
	'isAdult'
] as const
export type EditorialHistoryField = (typeof EDITORIAL_HISTORY_FIELDS)[number]

export const HISTORY_FIELDS = [...EDITORIAL_HISTORY_FIELDS, 'artwork'] as const
export type HistoryField = (typeof HISTORY_FIELDS)[number]

export const HISTORY_FIELD_NAMES: readonly HistoryField[] = HISTORY_FIELDS
export const EDITORIAL_FIELD_NAMES: readonly EditorialHistoryField[] = EDITORIAL_HISTORY_FIELDS

const isEditableField = (field: string): field is EditorialHistoryField =>
	(EDITORIAL_HISTORY_FIELDS as readonly string[]).includes(field)
const isHistoryField = (field: string): field is HistoryField =>
	(HISTORY_FIELDS as readonly string[]).includes(field)

/**
 * Deterministic per-(ASIN,region) history state key. Callers of
 * `bookKey(asin, region)` cannot supply a different state key.
 */
export const bookKey = (asin: string, region: string): string => `${region}:${asin}`

export interface JsonObject {
	[key: string]: JsonValue
}

/** JSON primitives, arrays, and objects of the same. */
export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(JsonValueSchema),
		z.record(z.string(), JsonValueSchema)
	])
)

/**
 * A tracked value envelope. Unknown evidence is an omitted observation, not
 * an absent envelope and not a JSON null, so `{state:'absent'}` only ever
 * means "the source explicitly declared this field to be empty".
 */
export type HistoryValue = { state: 'absent' } | { state: 'value'; value: JsonValue }

export const HistoryValueSchema: z.ZodType<HistoryValue> = z.union([
	z.object({ state: z.literal('absent') }),
	z.object({ state: z.literal('value'), value: JsonValueSchema })
])

/** Where a field observation came from. */
export type HistorySource = 'audible_api' | 'audible_html'
export const HistorySourceSchema = z.enum(['audible_api', 'audible_html'])

/**
 * The per-field policy identifiers. All editorial fields default to
 * `editorial:<field>:v1` except:
 *
 * - `genres`: `genres:api:v1` / `genres:html:v1` selected by evidence source
 * - `releaseDate`: `releaseDate:release:v1` / `releaseDate:issue:v1`
 *   selected by which upstream date supplied the value
 * - `literatureType`: `literatureType:v1` from the classifier constant
 *
 * A policy change silently replaces only the affected baseline and its
 * coverage start; it must not suppress unrelated comparable changes.
 */
export const ARTWORK_POLICY = 'artwork:amazon-id:v1'
export const GENRES_API_POLICY = 'genres:api:v1'
export const GENRES_HTML_POLICY = 'genres:html:v1'
export const RELEASE_DATE_RELEASE_POLICY = 'releaseDate:release:v1'
export const RELEASE_DATE_ISSUE_POLICY = 'releaseDate:issue:v1'
export const LITERATURE_TYPE_POLICY_ID = LITERATURE_TYPE_POLICY

export const EDITORIAL_FIELD_POLICIES: Record<EditorialHistoryField, string> = {
	title: 'editorial:title:v1',
	subtitle: 'editorial:subtitle:v1',
	authors: 'editorial:authors:v1',
	narrators: 'editorial:narrators:v1',
	publisherName: 'editorial:publisherName:v1',
	description: 'editorial:description:v1',
	summary: 'editorial:summary:v1',
	isbn: 'editorial:isbn:v1',
	language: 'editorial:language:v1',
	formatType: 'editorial:formatType:v1',
	copyright: 'editorial:copyright:v1',
	releaseDate: RELEASE_DATE_RELEASE_POLICY,
	runtimeLengthMin: 'editorial:runtimeLengthMin:v1',
	seriesPrimary: 'editorial:seriesPrimary:v1',
	seriesSecondary: 'editorial:seriesSecondary:v1',
	genres: GENRES_API_POLICY,
	literatureType: LITERATURE_TYPE_POLICY,
	isAdult: 'editorial:isAdult:v1'
}

/** One tracked field's observed evidence in a single observation. */
export interface FieldObservation {
	field: EditorialHistoryField
	policy: string
	value: HistoryValue
	source: HistorySource
}

const FieldObservationSchema: z.ZodType<FieldObservation> = z.object({
	field: z.string().refine(isEditableField),
	policy: z.string().min(1),
	value: HistoryValueSchema,
	source: HistorySourceSchema
})

/** One returned product_image rendition reference. */
export interface ArtworkReference {
	rendition: string
	sourceUrl: string
	imageId: string | null
}

export const ArtworkReferenceSchema: z.ZodType<ArtworkReference> = z.object({
	rendition: z.string().min(1),
	sourceUrl: z.string().min(1),
	imageId: z.string().nullable()
})

const FieldObservationsSchema = z.array(FieldObservationSchema)
const ArtworkReferencesSchema = z.array(ArtworkReferenceSchema)

/**
 * A single fresh observation of the source data. Timestamps are response
 * receipt times and never decide precedence.
 */
export interface BookObservation {
	observedAt: Date
	apiReceivedAt: Date
	htmlReceivedAt?: Date
	responseGroups: string[]
	requestedRenditions: string[]
	fields: FieldObservation[]
	artwork: ArtworkReference[]
}

export const BookObservationSchema: z.ZodType<BookObservation> = z.object({
	observedAt: z.date(),
	apiReceivedAt: z.date(),
	htmlReceivedAt: z.date().optional(),
	responseGroups: z.array(z.string()),
	requestedRenditions: z.array(z.string()),
	fields: FieldObservationsSchema,
	artwork: ArtworkReferencesSchema
})

/** A stored per-field baseline (one current baseline per field). */
export interface FieldBaseline {
	field: EditorialHistoryField
	policy: string
	value: HistoryValue
	baselineAt: Date
}

/** A stored per-rendition artwork baseline (comparable rendered IDs only). */
export interface RenditionBaseline {
	rendition: string
	policy: string
	imageId: string
	sourceUrl: string
	baselineAt: Date
}

/**
 * Comparison inputs for the pure comparison function. Baseline arrays hold
 * at most one entry per field/rendition — one current baseline, not one per
 * poll.
 */
export interface HistoryBaselines {
	fields: FieldBaseline[]
	renditions: RenditionBaseline[]
}

/** One artwork transition for a changed comparable rendition. */
export interface ArtworkChange {
	rendition: string
	before: { imageId: string; sourceUrl: string }
	after: { imageId: string; sourceUrl: string }
}

export const ArtworkChangeSchema: z.ZodType<ArtworkChange> = z.object({
	rendition: z.string().min(1),
	before: z.object({ imageId: z.string(), sourceUrl: z.string() }),
	after: z.object({ imageId: z.string(), sourceUrl: z.string() })
})

/**
 * The complete immutable delta stored on a revision: one entry per changed
 * editorial field keyed by its public name, plus an optional `artwork` array
 * for changed comparable renditions.
 */
export type BookHistoryChanges = Record<
	string,
	{ before: HistoryValue; after: HistoryValue } | ArtworkChange[]
>

/** Policies applied to the changed fields/artwork in one revision. */
export interface BookHistoryPolicies {
	fields: Record<string, string>
	artwork: Record<string, string>
}

/**
 * `limit` arrives from the query string as a decimal digit string; accepted
 * values convert to integers 1–100, default 50. Arrays/repeated query values
 * are rejected by Fastify before parsing (last-wins on the raw value), and
 * invalid/empty values fail this schema.
 */
const LimitQuerySchema = z
	.string()
	.regex(/^\d{1,3}$/)
	.transform((s) => Number.parseInt(s, 10))
	.refine((n) => n >= 1 && n <= 100)
	.default(50)

/** Strict allowlist query for `GET /books/:asin/history`. */
export const historyListQuerySchema: z.ZodType<HistoryListQuery> = z
	.object({
		region: RegionSchema.default('us'),
		limit: LimitQuerySchema,
		cursor: z.string().min(1).max(HISTORY_CURSOR_MAX_LENGTH).optional(),
		field: z.string().refine(isHistoryField).optional()
	})
	.strict()
export type HistoryListQuery = {
	region: string
	limit: number
	cursor?: string
	field?: HistoryField
}

/** Strict allowlist query for `GET /books/:asin/artwork`. */
export const artworkListQuerySchema: z.ZodType<ArtworkListQuery> = z
	.object({
		region: RegionSchema.default('us'),
		limit: LimitQuerySchema,
		cursor: z.string().min(1).max(HISTORY_CURSOR_MAX_LENGTH).optional()
	})
	.strict()
export type ArtworkListQuery = {
	region: string
	limit: number
	cursor?: string
}

/** Strict allowlist query for `GET /books/:asin/history/:revision`. */
export const historyDetailQuerySchema: z.ZodType<{ region: string }> = z
	.object({ region: RegionSchema.default('us') })
	.strict()

export const HISTORY_REVISION_REGEX = /^[1-9][0-9]*$/

/**
 * Resolve `BOOK_HISTORY_ENABLED`. Unset is disabled; the literals true/false
 * select the mode; any other supplied value is a startup error.
 */
export function isBookHistoryEnabled(
	env: Record<string, string | undefined> = process.env
): boolean {
	// Blank/whitespace values count as unset: container env substitution
	// (`${BOOK_HISTORY_ENABLED:-}`) yields an empty string for unset flags,
	// which must mean disabled, not "invalid".
	const raw = env.BOOK_HISTORY_ENABLED?.trim()
	if (raw === undefined || raw === '') return false
	if (raw === 'false') return false
	if (raw === 'true') return true
	throw new Error('BOOK_HISTORY_ENABLED must be true or false')
}

/**
 * Explicitly named history indexes. State `_id` already enforces its
 * deterministic ASIN/region key; exception and progress `_id` indexes suffice.
 * Not derived from a catalog scan on startup. `prepare` creates them
 * idempotently; a same-name conflicting definition fails with the
 * conflicting name and never replaces/drops an existing index.
 */
export interface HistoryIndexDefinition {
	collection: string
	name: string
	keys: Record<string, 1 | -1>
	unique?: boolean
	partialFilterExpression?: Record<string, unknown>
}

export const HISTORY_INDEX_DEFINITIONS: HistoryIndexDefinition[] = [
	{
		collection: 'book_history_revisions',
		name: 'history_revision',
		keys: { asin: 1, region: 1, revision: 1 },
		unique: true
	},
	{
		collection: 'book_history_revisions',
		name: 'history_field',
		keys: { asin: 1, region: 1, changedFields: 1, revision: -1 }
	},
	{
		collection: 'book_artwork',
		name: 'artwork_image',
		keys: { asin: 1, region: 1, imageId: 1 },
		unique: true,
		partialFilterExpression: { imageId: { $type: 'string' } }
	},
	{
		collection: 'book_artwork',
		name: 'artwork_unparsed',
		keys: { asin: 1, region: 1, unparsedKey: 1 },
		unique: true,
		partialFilterExpression: { unparsedKey: { $type: 'string' } }
	},
	{
		collection: 'book_artwork',
		name: 'artwork_order',
		keys: { asin: 1, region: 1, sequence: 1 },
		unique: true
	},
	{
		collection: 'books',
		name: 'history_book_lookup',
		keys: { asin: 1, region: 1 }
	},
	// `book_history_states` and `book_history_seed_progress` are keyed by
	// their `_id` (bookKey / the deterministic seed id); the default unique
	// `_id_` index is created by MongoDB by construction and cannot be
	// renamed, so it needs no definition here.
	{
		collection: 'book_history_seed_progress',
		name: 'book_history_seed_progress_position',
		keys: { _id: 1, lastId: 1 }
	}
]

export const SEED_PROGRESS_ID = 'legacy-artwork-v1'
