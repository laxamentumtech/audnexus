import { schema, types } from 'papr'
import { z } from 'zod'

import { FieldBaseline, HistoryValueSchema, RenditionBaseline } from '#config/bookHistory'
import papr from '#config/papr'

// Related Papr models for the observed Audible metadata and artwork history
// feature. Explicit BSON dates are stored — no automatic timestamps or TTL.
// Shape-level Papr validation only; loose leaves (value envelopes, changes
// maps, policies) are validated with the shared Zod schemas wherever a DB
// document is read back (decode* helpers, reads in BookHistoryHelper/Store).

const fieldBaselineSchema = types.object({
	field: types.string({ required: true }),
	policy: types.string({ required: true }),
	value: types.unknown(),
	baselineAt: types.date({ required: true })
})
const renditionBaselineSchema = types.object({
	rendition: types.string({ required: true }),
	policy: types.string({ required: true }),
	imageId: types.string({ required: true }),
	sourceUrl: types.string({ required: true }),
	baselineAt: types.date({ required: true })
})

const bookHistoryStateSchema = schema(
	{
		_id: types.string({ required: true }),
		asin: types.string({ required: true }),
		region: types.string({ required: true }),
		allocatedGeneration: types.number({ required: true }),
		acceptedGeneration: types.number({ required: true }),
		deleteFence: types.number({ required: true }),
		revision: types.number({ required: true }),
		assetSequence: types.number({ required: true }),
		stateVersion: types.number({ required: true }),
		established: types.boolean({ required: true }),
		legacyCaptured: types.boolean({ required: true }),
		startedAt: types.date(),
		fields: types.array(fieldBaselineSchema),
		renditions: types.array(renditionBaselineSchema)
	},
	{
		defaults: {
			allocatedGeneration: 0,
			acceptedGeneration: 0,
			deleteFence: 0,
			revision: 0,
			assetSequence: 0,
			stateVersion: 0,
			established: false,
			legacyCaptured: false,
			fields: [],
			renditions: []
		}
	}
)
export type BookHistoryStateDocument = (typeof bookHistoryStateSchema)[0]

/** Decode the raw state document's field/rendition baselines. */
export function decodeStateBaselines(state: BookHistoryStateDocument): {
	fields: FieldBaseline[]
	renditions: RenditionBaseline[]
} {
	const fields: FieldBaseline[] = []
	for (const entry of state.fields ?? []) {
		const value = HistoryValueSchema.parse(entry.value)
		fields.push({
			field: entry.field as FieldBaseline['field'],
			policy: entry.policy,
			value,
			baselineAt: entry.baselineAt
		})
	}
	const renditions: RenditionBaseline[] = []
	for (const entry of state.renditions ?? []) {
		renditions.push({
			rendition: entry.rendition,
			policy: entry.policy,
			imageId: entry.imageId,
			sourceUrl: entry.sourceUrl,
			baselineAt: entry.baselineAt
		})
	}
	return { fields, renditions }
}

const bookHistoryRevisionSchema = schema({
	asin: types.string({ required: true }),
	region: types.string({ required: true }),
	revision: types.number({ required: true }),
	generation: types.number({ required: true }),
	observedAt: types.date({ required: true }),
	changedFields: types.array(types.string()),
	policies: types.object({
		fields: types.objectGeneric(types.string()),
		artwork: types.objectGeneric(types.string())
	}),
	changes: types.objectGeneric(types.unknown())
})
export type BookHistoryRevisionDocument = (typeof bookHistoryRevisionSchema)[0]

const artworkRenditionSchema = types.object({
	rendition: types.string({ required: true }),
	firstSourceUrl: types.string({ required: true }),
	sourceUrl: types.string({ required: true }),
	firstObservedAt: types.date({ required: true }),
	observedAt: types.date({ required: true })
})
const artworkLegacySchema = types.object({
	sourceBookId: types.objectId({ required: true }),
	storedUrl: types.string({ required: true }),
	importedAt: types.date({ required: true })
})

const bookArtworkSchema = schema({
	asin: types.string({ required: true }),
	region: types.string({ required: true }),
	sequence: types.number({ required: true }),
	imageId: types.string(),
	unparsedKey: types.string(),
	legacy: artworkLegacySchema,
	renditions: types.array(artworkRenditionSchema)
})
export type BookArtworkDocument = (typeof bookArtworkSchema)[0]

const bookHistorySeedProgressSchema = schema(
	{
		_id: types.string({ required: true }),
		runId: types.string({ required: true }),
		lastId: types.objectId(),
		upperId: types.objectId(),
		completed: types.boolean(),
		startedAt: types.date({ required: true }),
		updatedAt: types.date({ required: true })
	},
	{
		defaults: {
			completed: false
		}
	}
)
export type BookHistorySeedProgressDocument = (typeof bookHistorySeedProgressSchema)[0]

// Identity exception region representation: tagged so missing and null are
// distinguishable.
export type ExceptionRegionValue =
	| { state: 'missing' }
	| { state: 'null' }
	| { state: 'value'; value: string }

export const ExceptionRegionSchema: z.ZodType<ExceptionRegionValue> = z.discriminatedUnion(
	'state',
	[
		z.object({ state: z.literal('missing') }),
		z.object({ state: z.literal('null') }),
		z.object({ state: z.literal('value'), value: z.string() })
	]
)

const bookHistoryIdentityExceptionSchema = schema({
	asin: types.string({ required: true }),
	region: types.object({
		state: types.string({ enum: ['missing', 'null', 'value'], required: true }),
		value: types.string()
	}),
	storedUrl: types.string(),
	importedAt: types.date(),
	reasons: types.array(types.string())
})
export type BookHistoryIdentityExceptionDocument = (typeof bookHistoryIdentityExceptionSchema)[0]

export const BookHistoryStateModel = papr.model('book_history_states', bookHistoryStateSchema)

export const BookHistoryRevisionModel = papr.model(
	'book_history_revisions',
	bookHistoryRevisionSchema
)
export const BookArtworkModel = papr.model('book_artwork', bookArtworkSchema)
export const BookHistorySeedProgressModel = papr.model(
	'book_history_seed_progress',
	bookHistorySeedProgressSchema
)
export const BookHistoryIdentityExceptionModel = papr.model(
	'book_history_identity_exceptions',
	bookHistoryIdentityExceptionSchema
)
