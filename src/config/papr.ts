import Papr from 'papr'

import { isBookHistoryEnabled } from '#config/bookHistory'
import type { Context } from '#config/context'
import { BookHistoryStore } from '#helpers/database/papr/BookHistoryStore'

const papr = new Papr()

/** The shared transactional history store, configured with the app client. */
export const bookHistoryStore = new BookHistoryStore()

/**
 * Register models and prepare schemas. `bookHistoryEnabled` defaults to the
 * resolved `BOOK_HISTORY_ENABLED` env flag. History models are registered in
 * both modes (dynamic import breaks the models→papr import cycle), and the
 * shared store is configured with the same MongoClient in both modes so
 * read-only routes can read retained history while recording is disabled.
 */
export async function initialize(
	ctx: Context,
	options: { bookHistoryEnabled?: boolean } = {}
): Promise<void> {
	const enabled = options.bookHistoryEnabled ?? isBookHistoryEnabled()
	// Dynamic import is required here: the BookHistory models import `papr`
	// from this module and register at module load; a static import would be
	// a circular dependency (models→papr) that breaks at load.
	await import('#config/models/BookHistory')
	void enabled
	papr.initialize(ctx.client.db('audnexus'))
	bookHistoryStore.configure(ctx.client)
	await papr.updateSchemas()
}

export default papr
