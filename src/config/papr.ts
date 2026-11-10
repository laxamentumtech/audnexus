import Papr from 'papr'

import type { Context } from '#config/context'
import { BookHistoryStore } from '#helpers/database/papr/BookHistoryStore'

const papr = new Papr()

/** The shared transactional history store, configured with the app client. */
export const bookHistoryStore = new BookHistoryStore()

/**
 * Register models and prepare schemas. History models are registered in
 * both modes (dynamic import breaks the models→papr import cycle), and the
 * shared store is configured with the same MongoClient in both modes so
 * read-only routes can read retained history while recording is disabled.
 * Recording is gated at call sites via `isBookHistoryEnabled()`.
 */
export async function initialize(ctx: Context): Promise<void> {
	// Dynamic import is required here: the BookHistory models import `papr`
	// from this module and register at module load; a static import would be
	// a circular dependency (models→papr) that breaks at load.
	await import('#config/models/BookHistory')
	papr.initialize(ctx.client.db('audnexus'))
	bookHistoryStore.configure(ctx.client)
	await papr.updateSchemas()
}

export default papr
