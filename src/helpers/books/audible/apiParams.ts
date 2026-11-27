/**
 * Shared request parameters for Audible's product API.
 *
 * The single-product and multi-ASIN endpoints must be asked for the same
 * response groups and image renditions: a batched product is then
 * interchangeable with the per-product response, so the existing parser,
 * history evidence, and persistence path can be reused unchanged.
 */
import { AsinSchema } from '#config/types'

export const AUDIBLE_RESPONSE_GROUPS = [
	'category_ladders',
	'contributors',
	'media',
	'product_attrs',
	'product_desc',
	'product_details',
	'product_extended_attrs',
	'rating',
	'series'
] as const

/** The image renditions requested from the product API (`image_sizes`),
 * mirrored verbatim in the history evidence so the observation and the
 * request can never drift. */
export const REQUESTED_IMAGE_SIZES = ['500', '1024'] as const

/** Undocumented hard cap on the multi-ASIN endpoint: 50 returns 200, 51
 * returns 400. */
export const AUDIBLE_BATCH_MAX_ASINS = 50

/** `response_groups=...&image_sizes=...` query string shared by both
 * endpoints. The batch endpoint must ask for the same groups as the
 * single-product path — `tags` for every region and `goodreads_ratings`
 * for the US catalog — so a batched product stays interchangeable with
 * the per-product response. */
export function buildProductQuery(region: string): string {
	const groups = [...AUDIBLE_RESPONSE_GROUPS, 'tags']
	// Goodreads ratings are only requested for the US catalog
	if (region === 'us') groups.push('goodreads_ratings')
	return `response_groups=${groups.join(',')}&image_sizes=${REQUESTED_IMAGE_SIZES.join(',')}`
}

/**
 * Keep only well-formed 10-char ASINs. Upstream-supplied IDs (catalog
 * `similar_products`, batch `asins` requests) are interpolated into request
 * URLs; anything that is not a plain 10-char ASIN is dropped so a value
 * containing `,`, `&` or `=` cannot change the request shape.
 *
 * Returns the PARSED (trimmed) value, not the raw input: `AsinSchema`
 * normalizes surrounding whitespace, and a padded ASIN would be sent with
 * encoded whitespace, answered with the catalog's canonical ID, and fail
 * the membership check.
 */
export function validateAsinList(asins: string[]): string[] {
	return asins.flatMap((asin) => {
		const parsed = AsinSchema.safeParse(asin)
		return parsed.success ? [parsed.data] : []
	})
}
