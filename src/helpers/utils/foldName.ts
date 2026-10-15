/**
 * Folds an author name for identity comparison: trim, collapse internal
 * whitespace, and lowercase, so case and spacing variants of the same name
 * fold onto a single identity. Non-Latin scripts (e.g. Japanese) have no
 * casing, so distinct spellings only merge when whitespace differs.
 */
export const foldName = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase()
