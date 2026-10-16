/**
 * Folds an author name for identity comparison: NFKC-normalize, trim,
 * collapse internal whitespace, and lowercase, so case, spacing, and
 * Unicode-encoding variants (composed vs decomposed, full-width Latin) of
 * the same name fold onto a single identity. Non-Latin scripts (e.g.
 * Japanese) have no casing, so distinct spellings only merge when
 * whitespace differs.
 */
export const foldName = (name: string): string =>
	name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
