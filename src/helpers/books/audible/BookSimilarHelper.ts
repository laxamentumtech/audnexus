import type { ApiBookSummary, ApiSeries } from '#config/types'
import { ApiBookSummarySchema, AsinSchema, AudibleSeriesSchema } from '#config/types'
import { validateAsinList } from '#helpers/books/audible/apiParams'
import { fetchStatus } from '#helpers/books/audible/responseGroups'
import fetch from '#helpers/utils/fetchPlus'
import { ErrorMessageHTTPFetch } from '#static/messages'
import { regions } from '#static/regions'

/** Upstream caps similar products at 50 results. */
const SIMILAR_RESULT_CAP = 50

/** Book-shaped content types; everything else is rejected by the full
 * parser, so the summary projection must reject it too. */
const BOOK_CONTENT_TYPES: readonly string[] = ['MultiPartBook', 'SinglePartBook']

function mapPeople(raw: unknown): { asin?: string; name: string }[] {
	if (!Array.isArray(raw)) return []
	return raw
		.map((person) => {
			if (
				!person ||
				typeof person !== 'object' ||
				!('name' in person) ||
				typeof person.name !== 'string'
			) {
				return undefined
			}
			return {
				...('asin' in person && typeof person.asin === 'string' ? { asin: person.asin } : {}),
				name: person.name
			}
		})
		.filter((p): p is { asin?: string; name: string } => p !== undefined)
}

interface SimilarProduct {
	asin?: string
}

interface SimilarResponse {
	similar_products?: SimilarProduct[]
}

class BookSimilarHelper {
	asin: string
	private baseDomain: string

	constructor(asin: string, region: string) {
		this.asin = asin
		this.baseDomain = `https://api.audible.${regions[region].tld}`
	}

	/**
	 * Fetch the upstream RawSimilarities list for the book.
	 */
	async fetchSimilar(): Promise<SimilarResponse> {
		const url = `${this.baseDomain}/1.0/catalog/products/${this.asin}/sims?similarity_type=RawSimilarities&num_results=${SIMILAR_RESULT_CAP}`
		return fetch(url)
			.then((response) => response.data as SimilarResponse)
			.catch((error) => {
				throw new Error(ErrorMessageHTTPFetch(this.asin, fetchStatus(error), 'Audible API'))
			})
	}

	/**
	 * Extract the similar book ASINs: string ids only, deduplicated,
	 * capped at 50. Missing/empty data is an empty list, not an error.
	 */
	async getSimilarAsins(): Promise<string[]> {
		const response = await this.fetchSimilar()
		const seen = new Set<string>()
		const asins: string[] = []
		const products = response?.similar_products
		for (const product of Array.isArray(products) ? products : []) {
			if (typeof product?.asin !== 'string') continue
			// Only well-formed 10-char ASINs may enter a request URL.
			// Emit the parsed (trimmed) value so the list is canonical.
			const parsed = AsinSchema.safeParse(product.asin)
			if (!parsed.success) continue
			if (seen.has(parsed.data)) continue
			seen.add(parsed.data)
			asins.push(parsed.data)
			if (asins.length >= SIMILAR_RESULT_CAP) break
		}
		return asins
	}

	/**
	 * Bulk-expand ASINs into compact book summaries. Invalid entries are
	 * omitted; a bulk fetch failure throws (no partial response).
	 */
	async expand(asins: string[]): Promise<ApiBookSummary[]> {
		const requested = validateAsinList(asins)
		const requestedSet = new Set(requested)
		const asinCsv = encodeURIComponent(requested.join(','))
		const url =
			`${this.baseDomain}/1.0/catalog/products?asins=${asinCsv}` +
			`&response_groups=contributors,media,product_attrs,product_desc,product_details,rating,series&image_sizes=500,1024`
		const response = await fetch(url).catch((error) => {
			throw new Error(ErrorMessageHTTPFetch(this.asin, fetchStatus(error), 'Audible API'))
		})
		const products: unknown[] = (response.data as { products?: unknown[] })?.products ?? []

		const summaries: ApiBookSummary[] = []
		for (const raw of products) {
			// Only requested ASINs may expand: an unexpected product in the
			// response must not appear in the result.
			if (!raw || typeof raw !== 'object' || !('asin' in raw)) continue
			const productAsin = raw.asin
			if (typeof productAsin !== 'string') continue
			// Parse the response ASIN before the requested-set check: the
			// requested values are trimmed by `getSimilarAsins`, so a
			// product returning its ASIN with surrounding whitespace must
			// still match — the raw string would miss the set and drop a
			// valid related book.
			const parsedAsin = AsinSchema.safeParse(productAsin)
			if (!parsedAsin.success || !requestedSet.has(parsedAsin.data)) continue
			const summary = this.productToSummary(raw)
			if (summary) summaries.push(summary)
		}
		return summaries
	}

	/**
	 * Map one raw catalog product to the public summary projection, or
	 * undefined when required fields are missing/invalid.
	 */
	private productToSummary(raw: unknown): ApiBookSummary | undefined {
		if (!raw || typeof raw !== 'object') return undefined
		const product = raw as Record<string, unknown>
		if (typeof product.asin !== 'string' || typeof product.title !== 'string') return undefined
		// Same book-type gate as the full parser: Bundle/Podcast/Periodical
		// and other non-book content types are rejected, not mapped.
		const contentType =
			typeof product.content_delivery_type === 'string' ? product.content_delivery_type : undefined
		if (contentType !== undefined && !BOOK_CONTENT_TYPES.includes(contentType)) return undefined

		const authors = mapPeople(product.authors)
		const narrators = mapPeople(product.narrators)

		const images =
			product.product_images && typeof product.product_images === 'object'
				? (product.product_images as Record<string, unknown>)
				: undefined
		const image =
			images && typeof images['500'] === 'string'
				? images['500']
				: images && typeof images['1024'] === 'string'
					? images['1024']
					: undefined

		let rating: string | undefined
		const ratingGroup = product.rating
		if (
			ratingGroup &&
			typeof ratingGroup === 'object' &&
			'overall_distribution' in ratingGroup &&
			ratingGroup.overall_distribution &&
			typeof ratingGroup.overall_distribution === 'object'
		) {
			const overall = ratingGroup.overall_distribution
			if ('display_average_rating' in overall) {
				const display = overall.display_average_rating
				if (typeof display === 'string') rating = display
			}
		}

		let seriesPrimary: ApiSeries | undefined
		if (Array.isArray(product.series)) {
			// Same selection rule as the full parser: the primary series is
			// the one matching publication_name, not the first entry.
			const publicationName =
				typeof product.publication_name === 'string' ? product.publication_name : undefined
			for (const rawSeries of product.series) {
				const mapped = this.mapSeries(rawSeries)
				if (publicationName && mapped && mapped.name === publicationName) {
					seriesPrimary = mapped
					break
				}
			}
		}

		// Same date fallback as the full parser: a non-empty release_date,
		// else the issue date, else no summary.
		const releaseDate =
			typeof product.release_date === 'string' && product.release_date.length > 0
				? product.release_date
				: typeof product.issue_date === 'string' && product.issue_date.length > 0
					? product.issue_date
					: undefined
		if (!releaseDate) return undefined
		const runtimeLengthMin =
			typeof product.runtime_length_min === 'number' ? product.runtime_length_min : undefined

		const parsed = ApiBookSummarySchema.safeParse({
			asin: product.asin,
			title: product.title,
			authors,
			narrators,
			...(image && { image }),
			...(rating && { rating }),
			releaseDate,
			...(runtimeLengthMin !== undefined && { runtimeLengthMin }),
			...(seriesPrimary && { seriesPrimary })
		})
		return parsed.success ? parsed.data : undefined
	}

	/** Map one upstream series to the public series projection. */
	private mapSeries(raw: unknown): ApiSeries | undefined {
		if (!AudibleSeriesSchema.safeParse(raw).success) return undefined
		const series = raw as { asin?: string; title: string; sequence?: string }
		const json = {
			...(series.asin && { asin: series.asin }),
			name: series.title,
			...(series.sequence && { position: series.sequence })
		}
		const parsed = ApiBookSummarySchema.shape.seriesPrimary.safeParse(json)
		return parsed.success ? parsed.data : undefined
	}
}

export default BookSimilarHelper
