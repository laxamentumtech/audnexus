import Papr from 'papr'

import type { Context } from '#config/context'

const papr = new Papr()
export async function initialize(ctx: Context) {
	papr.initialize(ctx.client.db('audnexus'))
	await papr.updateSchemas()
}
export default papr
