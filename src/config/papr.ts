import Papr from 'papr'

import type { Context } from '#config/context'

const papr = new Papr()
export async function initialize(ctx: Context) {
	papr.initialize(ctx.client.db('audnexus'))
	await papr.updateSchemas()
	// papr v17 has no schema-declared index API, so indexes are created here at init time.
	// createIndex is a no-op when the identical index already exists.
	//
	// The text index on name backs the $text search in
	// PaprAudibleAuthorHelper.findByName (GET /authors?name=). Its creation is
	// a deliberate hard startup dependency — consistent with the hard
	// dependency on papr.updateSchemas() — so the server refuses to start
	// without it rather than serve a broken author search.
	await ctx.client.db('audnexus').collection('authors').createIndex({ name: 'text' })
	// Compound key backs the ASIN-scoped author index refresh queries
	// (AuthorNameIndex) and regional author lookups; the text index does not
	// support { asin: { $in: [...] } } filters.
	await ctx.client.db('audnexus').collection('authors').createIndex({ asin: 1, region: 1 })
}
export default papr
