// Pure mapping of raw Audible product API tag namespaces and the Goodreads
// rating block into the public `tags` / `ratings.goodreads` projections.

import type { ApiTag, ApiTagType } from '#config/types'

/** Upstream tag namespace (`type`) to public tag type. Unknown types map to
 * `other` via TAG_TYPE_MAP lookup in mapAudibleTags. */
export const TAG_TYPE_MAP: Record<string, ApiTagType> = {
	mood: 'mood',
	theme: 'theme',
	'world_tree-publisher_assigned': 'topic',
	'world_tree-model_assigned': 'topic',
	coverage_expansion: 'topic',
	audible_editors: 'editorial',
	goodreads: 'goodreads',
	awards: 'award',
	social_media: 'social',
	franchise: 'franchise',
	duration: 'duration',
	instareads: 'instareads'
}

/**
 * Map a raw `tags` response-group array to the public tag projection.
 *
 * - Not an array → `undefined` (no evidence).
 * - Empty array → `[]` (explicitly no tags).
 * - Each valid entry needs a nonempty string `id`, nonempty string
 *   `display_text`, and a string `type`; unknown types map to `'other'`.
 * - Entries are deduplicated by `tagId`, keeping the first occurrence and
 *   upstream order.
 * - Nonempty raw array with zero valid entries → `undefined`.
 * - Nonempty raw array with at least one valid entry → the valid subset.
 */
export function mapAudibleTags(raw: unknown): ApiTag[] | undefined {
	if (!Array.isArray(raw)) return undefined
	if (raw.length === 0) return []

	const seen = new Set<string>()
	const tags: ApiTag[] = []
	for (const entry of raw) {
		if (!entry || typeof entry !== 'object') continue
		const record = entry as Record<string, unknown>
		const id = record.id
		const displayText = record.display_text
		const type = record.type
		if (typeof id !== 'string' || id.length === 0) continue
		if (typeof displayText !== 'string' || displayText.length === 0) continue
		if (typeof type !== 'string') continue
		if (seen.has(id)) continue
		seen.add(id)
		tags.push({
			tagId: id,
			name: displayText,
			type: TAG_TYPE_MAP[type] ?? 'other'
		})
	}
	return tags.length > 0 ? tags : undefined
}

/**
 * Map the raw `goodreads_ratings` response group (US only) to the public
 * Goodreads rating. `count` arrives as a string (e.g. `"4,210"`); non-digit
 * characters are stripped. `value` is rounded to one decimal.
 */
export function parseGoodreadsRating(raw: unknown):
	| {
			value: number
			numRatings: number
	  }
	| undefined {
	if (!raw || typeof raw !== 'object') return undefined
	const record = raw as Record<string, unknown>
	const ratingNum = record.rating_num
	if (typeof ratingNum !== 'number' || !Number.isFinite(ratingNum)) return undefined
	const countRaw = record.count
	if (typeof countRaw !== 'string' && typeof countRaw !== 'number') return undefined
	const countStr = String(countRaw).replace(/\D/g, '')
	if (countStr.length === 0) return undefined
	const numRatings = Number.parseInt(countStr, 10)
	if (Number.isNaN(numRatings)) return undefined
	return { value: Math.round(ratingNum * 10) / 10, numRatings }
}
