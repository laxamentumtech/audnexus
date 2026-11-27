import type { FastifyBaseLogger } from 'fastify'

import { AudibleProduct, AudibleProductSchema } from '#config/types'
import {
	AUDIBLE_BATCH_MAX_ASINS,
	buildProductQuery,
	validateAsinList
} from '#helpers/books/audible/apiParams'
import { fetchWithTagsFallback } from '#helpers/books/audible/responseGroups'
import fetch from '#helpers/utils/fetchPlus'
import { regions } from '#static/regions'

/** A product fetched by the multi-ASIN endpoint, ready to hand to
 * `ApiHelper.acceptPrefetchedProduct`/`StitchHelper`. */
export interface PrefetchedApiProduct {
	product: AudibleProduct['product']
	responseGroups: string[]
	/** Receipt time of the batch response (shared by every product in it). */
	receivedAt: Date
}

export interface AudibleBatchResult {
	/** Products keyed by requested ASIN. Stubs (invalid/unavailable ASINs)
	 * are absent so callers fall back to the single-product path, which
	 * classifies the failure precisely. */
	found: Map<string, PrefetchedApiProduct>
	/** ASINs the endpoint returned as `{ asin }` stubs. */
	stubs: Set<string>
}

/** Split an array into chunks of at most `size`. */
function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = []
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
	return out
}

/**
 * Fetch up to 50 products per request from Audible's undocumented
 * multi-ASIN endpoint.
 *
 * Verified 2026-11-14: 50 ASINs returns 200, 51 returns 400; product order
 * is preserved; each product is byte-identical to the single-product
 * `product` object for the same response groups; invalid ASINs come back
 * as `{ asin }` stubs.
 *
 * Throws on transport/HTTP errors. Callers that can degrade per book should
 * catch and fall back to the single-product path.
 *
 * `signal` (optional) is forwarded to the batch requests: an aborted caller
 * (e.g. a deadline-expired backfill item) stops the in-flight request and
 * its retries, so a late 503 from an abandoned batch cannot raise the
 * shared adaptive cooldown after the per-book fallback has started.
 */
export async function fetchProductsByAsin(
	asins: string[],
	region: string,
	logger?: FastifyBaseLogger,
	signal?: AbortSignal
): Promise<AudibleBatchResult> {
	// Only well-formed 10-char ASINs may enter the request URL: the batch
	// `asins` value is interpolated verbatim, so a stray value containing
	// `,`, `&` or `=` would change the request shape.
	const unique = [...new Set(validateAsinList(asins))]
	const found = new Map<string, PrefetchedApiProduct>()
	const stubs = new Set<string>()
	const tld = regions[region]?.tld
	if (!tld) throw new Error(`Unknown Audible region: ${region}`)

	for (const batch of chunk(unique, AUDIBLE_BATCH_MAX_ASINS)) {
		// Scope the membership set to the CURRENT chunk: an unsolicited
		// product for a later chunk must not be accepted while this
		// earlier chunk's response is being filtered.
		const requested = new Set(batch)
		const url = `https://api.audible.${tld}/1.0/catalog/products?asins=${encodeURIComponent(
			batch.join(',')
		)}&${buildProductQuery(region)}`
		// The shared query requests `tags`; when upstream rejects that
		// group with the known 400, retry the chunk once without it —
		// the same one-shot fail-open the single-product path uses, so a
		// rejected optional group does not disable batching for the page.
		const response = await fetchWithTagsFallback((requestUrl) => fetch(requestUrl, { signal }), url)
		const body = response.data as {
			products?: unknown[]
			response_groups?: unknown[]
		}
		const products = Array.isArray(body?.products) ? body.products : []
		const rawGroups = body?.response_groups
		const responseGroups = Array.isArray(rawGroups)
			? rawGroups.filter((g): g is string => typeof g === 'string')
			: []
		if (!Array.isArray(rawGroups)) {
			// Do not substitute the requested list: history evidence must record
			// what the response actually declared, not what we asked for.
			logger?.warn(
				`[AUDIBLE BATCH] response_groups missing/malformed for ${batch.length} ASINs; recording no provenance`
			)
		}
		const receivedAt = new Date()

		let parsedCount = 0
		for (const raw of products) {
			if (!raw || typeof raw !== 'object') continue
			const candidate = raw as Record<string, unknown>
			const asin = typeof candidate.asin === 'string' ? candidate.asin : undefined
			// Only requested ASINs count: a product the endpoint returned
			// without being asked must not satisfy the request.
			if (!asin || !requested.has(asin)) continue
			// A stub carries only the ASIN: not found (invalid or unavailable).
			if (Object.keys(candidate).length <= 1) {
				stubs.add(asin)
				continue
			}
			const parsed = AudibleProductSchema.shape.product.safeParse(candidate)
			if (!parsed.success) {
				// Leave it to the single-product path to produce the precise
				// parse/region/delisted error.
				stubs.add(asin)
				continue
			}
			found.set(asin, { product: parsed.data, responseGroups, receivedAt })
			parsedCount += 1
		}
		logger?.debug(
			`[AUDIBLE BATCH] ${batch.length} requested, ${products.length} returned, ${parsedCount} parsed`
		)
	}

	return { found, stubs }
}
