// Pure observation comparison for the book history feature. No DB/Papr
// imports — unit tests cannot inherit Mongo module mocks. Implements the
// baseline/delta/policy contract from src/config/bookHistory.ts.
//
// Invariants:
// - Unknown evidence (no incoming field obs) retains the old baseline, never
//   erases it.
// - Missing baseline or policy mismatch initializes/replaces a baseline
//   silently (no change event).
// - Same-policy value inequality is a change; equipment taxonomy is already
//   canonicalized at capture (sorted, deduped tuples) so deep equality
//   ignores membership ordering.
// - Artwork transitions only between comparable parsed IDs in the same
//   previously-comparable rendition; a new URL for an equal ID updates the
//   reference, not a revision.

import type {
	ArtworkChange,
	BookHistoryChanges,
	BookHistoryPolicies,
	EditorialHistoryField,
	FieldBaseline,
	FieldObservation,
	HistoryBaselines,
	HistoryField,
	HistoryValue,
	JsonValue
} from '#config/bookHistory'
import type { BookObservation, RenditionBaseline } from '#config/bookHistory'
import { ARTWORK_POLICY, EDITORIAL_HISTORY_FIELDS } from '#config/bookHistory'

/** Order-insensitive object, order-sensitive array equality for JsonValue. */
export function jsonDeepEqual(a: JsonValue, b: JsonValue): boolean {
	if (a === b) return true
	if (a === null || b === null) return false
	if (typeof a !== typeof b) return false
	if (typeof a !== 'object') return false
	if (Array.isArray(a) !== Array.isArray(b)) return false
	if (Array.isArray(a)) {
		const bb = b as JsonValue[]
		if (a.length !== bb.length) return false
		for (let i = 0; i < a.length; i++) if (!jsonDeepEqual(a[i], bb[i])) return false
		return true
	}
	const ao = a as Record<string, JsonValue>
	const bo = b as Record<string, JsonValue>
	const aKeys = Object.keys(ao)
	const bKeys = Object.keys(bo)
	if (aKeys.length !== bKeys.length) return false
	for (const key of aKeys) {
		if (!(key in bo)) return false
		if (!jsonDeepEqual(ao[key], bo[key])) return false
	}
	return true
}

function sameValue(a: HistoryValue, b: HistoryValue): boolean {
	if (a.state !== b.state) return false
	if (a.state === 'absent' && b.state === 'absent') return true
	if (a.state === 'value' && b.state === 'value') return jsonDeepEqual(a.value, b.value)
	return false
}

export interface ComparisonResult {
	fields: FieldBaseline[]
	renditions: RenditionBaseline[]
	changedFields: HistoryField[]
	changes: BookHistoryChanges
	policies: BookHistoryPolicies
}

/**
 * Compare an incoming observation against the current baselines.
 * `previous` carries at most one baseline per field/rendition (current values
 * only, not per-poll history).
 */
export function compareBookObservation(
	previous: HistoryBaselines,
	incoming: BookObservation
): ComparisonResult {
	const oldFields = new Map<FieldBaseline['field'], FieldBaseline>()
	for (const b of previous.fields) oldFields.set(b.field, b)
	const oldRenditions = new Map<string, RenditionBaseline>()
	for (const r of previous.renditions) oldRenditions.set(r.rendition, r)

	const now = incoming.observedAt
	const newFields: FieldBaseline[] = []
	const newRenditions: RenditionBaseline[] = []
	const changedFields: HistoryField[] = []
	const changes: BookHistoryChanges = {}
	const policies: BookHistoryPolicies = { fields: {}, artwork: {} }

	// Editorial fields
	for (const field of EDITORIAL_HISTORY_FIELDS) {
		const incomingObs = incoming.fields.find((f) => f.field === field)
		const oldBaseline = oldFields.get(field)
		if (!incomingObs) {
			// Unknown evidence: retain the old baseline, no change
			if (oldBaseline) newFields.push(oldBaseline)
			continue
		}
		if (!oldBaseline || oldBaseline.policy !== incomingObs.policy) {
			// Missing baseline or policy change: initialize/replace silently
			newFields.push({
				field,
				policy: incomingObs.policy,
				value: incomingObs.value,
				baselineAt: now
			})
			continue
		}
		if (sameValue(oldBaseline.value, incomingObs.value)) {
			// Equal: retain old baseline and timestamp
			newFields.push(oldBaseline)
		} else {
			// Changed: advance baseline, record the delta
			newFields.push({
				field,
				policy: incomingObs.policy,
				value: incomingObs.value,
				baselineAt: now
			})
			changes[field] = { before: oldBaseline.value, after: incomingObs.value }
			policies.fields[field] = incomingObs.policy
			changedFields.push(field)
		}
	}

	// Artwork renditions
	let artworkChanged = false
	const incomingParsed = new Map<string, { sourceUrl: string; imageId: string }>()
	for (const ref of incoming.artwork) {
		if (ref.imageId !== null)
			incomingParsed.set(ref.rendition, { sourceUrl: ref.sourceUrl, imageId: ref.imageId })
	}
	// Process incoming comparable renditions
	for (const [rendition, ref] of incomingParsed) {
		const oldBaseline = oldRenditions.get(rendition)
		if (!oldBaseline) {
			// New comparable rendition: initialize baseline silently
			newRenditions.push({
				rendition,
				policy: ARTWORK_POLICY,
				imageId: ref.imageId,
				sourceUrl: ref.sourceUrl,
				baselineAt: now
			})
			continue
		}
		if (oldBaseline.imageId === ref.imageId) {
			// Same ID: update the reference URL if it moved, never a revision
			if (oldBaseline.sourceUrl === ref.sourceUrl) {
				newRenditions.push(oldBaseline)
			} else {
				newRenditions.push({
					...oldBaseline,
					sourceUrl: ref.sourceUrl
				})
			}
		} else {
			// Transition: different IDs in the same comparable rendition
			newRenditions.push({
				rendition,
				policy: ARTWORK_POLICY,
				imageId: ref.imageId,
				sourceUrl: ref.sourceUrl,
				baselineAt: now
			})
			// Accumulate: multiple renditions may transition in one
			// observation and each transition is recorded.
			changes['artwork'] = [
				...((changes['artwork'] as ArtworkChange[] | undefined) ?? []),
				{
					rendition,
					before: { imageId: oldBaseline.imageId, sourceUrl: oldBaseline.sourceUrl },
					after: { imageId: ref.imageId, sourceUrl: ref.sourceUrl }
				}
			]
			policies.artwork[rendition] = ARTWORK_POLICY
			artworkChanged = true
		}
	}
	// Retain baselines for renditions absent from this observation
	for (const [rendition, oldBaseline] of oldRenditions) {
		if (!incomingParsed.has(rendition)) newRenditions.push(oldBaseline)
	}
	if (artworkChanged) changedFields.push('artwork')

	return {
		fields: newFields,
		renditions: newRenditions,
		changedFields,
		changes,
		policies
	}
}

/** True when no tracked field or artwork transitioned. */
export function hasChanges(result: ComparisonResult): boolean {
	return result.changedFields.length > 0
}

// Re-exported for callers building FieldObservation-keyed lookups.
export type { EditorialHistoryField, FieldObservation }
