// One effective book projection for the persistence paths: the stored
// public row plus the incoming book's defined values, with retention rules
// for evidence-free fields. The projection — not a partial field list — is
// used for equality, the database write, and the returned/cached response,
// so a row and its response never drift.

import type { ApiBook } from '#config/types'

/** The series fields a persistence path may clear on explicit removal. */
export const SERIES_FIELDS = ['seriesPrimary', 'seriesSecondary'] as const

export interface EffectiveWrite {
	/** The complete book to $set (stored values present for evidence-free fields). */
	book: ApiBook
	/** Series keys to $unset (explicit removal evidence only). */
	unset: string[]
}

/** Per-field explicit series-removal evidence from the observation. */
export interface SeriesRemovalEvidence {
	seriesPrimary?: boolean
	seriesSecondary?: boolean
}

/**
 * Build the effective write object for one book update.
 *
 * Retention rules:
 * - `genres`: nonempty incoming genres replace stored; empty/absent
 *   incoming keeps stored (never nuke genres on an empty API result).
 * - `tags`: key present replaces (including explicit `[]`); key absent
 *   keeps stored.
 * - `ratings`: incoming absent keeps stored; incoming present without
 *   Goodreads merges stored Goodreads into it; otherwise incoming
 *   replaces.
 * - `rating`: incoming omitted keeps stored; incoming present replaces.
 * - `seriesPrimary`/`seriesSecondary`: a field with explicit removal
 *   evidence is deleted and listed in `unset`; a field without removal
 *   evidence keeps its stored value when the incoming book is silent,
 *   and a value-declared incoming series replaces.
 */
export function buildEffectiveWrite(
	stored: ApiBook | null | undefined,
	incoming: ApiBook,
	seriesRemoval: SeriesRemovalEvidence
): EffectiveWrite {
	// Own enumerable entries with non-undefined values.
	const defined: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(incoming)) {
		if (value !== undefined) defined[key] = value
	}
	const effective: Record<string, unknown> = {
		...(stored as unknown as Record<string, unknown> | undefined),
		...defined
	}

	// Genres: empty/absent incoming keeps stored genres. A stored `[]` is a
	// real key the database retains, so it stays in the projection (an
	// equal-object short-circuit can't diverge from the row) — only a
	// stored row without the key drops it.
	if (Array.isArray(defined.genres) && defined.genres.length === 0) {
		if (Array.isArray(stored?.genres)) effective.genres = stored.genres
		else delete effective.genres
	}

	// Ratings: incoming without Goodrides keeps stored Goodreads.
	if (defined.ratings !== undefined && stored?.ratings?.goodreads !== undefined) {
		const incomingRatings = defined.ratings as { goodreads?: unknown }
		if (incomingRatings.goodreads === undefined) {
			effective.ratings = { ...incomingRatings, goodreads: stored.ratings.goodreads }
		}
	}

	// Series: per-field explicit removal evidence deletes and unsets only
	// the removed keys; a value-declared series coexists with an absent
	// sibling.
	const unset: string[] = []
	for (const field of SERIES_FIELDS) {
		if (seriesRemoval[field]) {
			if (field in effective) unset.push(field)
			delete effective[field]
		}
	}

	return { book: effective as unknown as ApiBook, unset }
}

/**
 * The evidence-only write for `PaprAudibleBookHelper.update()`: the incoming
 * book's own defined values, with no stored-retained merge. Fields the
 * incoming book has no evidence for (stored genres on a genre-less refresh,
 * stored Goodreads, stored series, and any stored-only field) are omitted so
 * MongoDB leaves them untouched instead of restoring them from the caller's
 * snapshot — closing the read/merge/write race a full effective write
 * re-introduced. An empty/absent incoming genres list carries no genre
 * evidence, so it is omitted (never nukes stored genres).
 */
export function buildEvidenceOnlyWrite(incoming: ApiBook): Record<string, unknown> {
	const write: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(incoming)) {
		if (value === undefined) continue
		if (key === 'genres' && !(Array.isArray(value) && value.length > 0)) continue
		write[key] = value
	}
	return write
}
