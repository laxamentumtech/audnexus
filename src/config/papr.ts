import Papr from 'papr'

import type { Context } from '#config/context'

const papr = new Papr()
export async function initialize(ctx: Context) {
	papr.initialize(ctx.client.db('audnexus'))
	await papr.updateSchemas()
	// papr v17 has no schema-declared index API, so indexes are created here at init time.
	// createIndex is a no-op when the identical index already exists.
	// Text index on name backs the $text search in PaprAudibleAuthorHelper.findByName.
	await ctx.client.db('audnexus').collection('authors').createIndex({ name: 'text' })
}
export default papr
