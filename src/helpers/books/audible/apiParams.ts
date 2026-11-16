/**
 * Shared request parameters for Audible's product API.
 *
 * The single-product and multi-ASIN endpoints must be asked for the same
 * response groups and image renditions: a batched product is then
 * interchangeable with the per-product response, so the existing parser,
 * history evidence, and persistence path can be reused unchanged.
 */
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
 * endpoints. */
export function buildProductQuery(): string {
	return `response_groups=${AUDIBLE_RESPONSE_GROUPS.join(',')}&image_sizes=${REQUESTED_IMAGE_SIZES.join(',')}`
}
