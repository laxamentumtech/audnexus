import Papr from 'papr'

import type { Context } from '#config/context'
import { type IndexMode, reconcileIndexes } from '#helpers/database/indexes'
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
 * Existing callers use initialize(ctx); the DB-only apply command explicitly
 * selects auto without mutating the process-wide startup policy.
 */
export async function initialize(ctx: Context, mode?: IndexMode): Promise<void> {
	// Dynamic import is required here: the BookHistory models import `papr`
	// from this module and register at module load; a static import would be
	// a circular dependency (models→papr) that breaks at load.
	await Promise.all([
		import('#config/models/BookHistory'),
		import('#config/models/Book'),
		import('#config/models/Author'),
		import('#config/models/Chapter')
	])
	const db = ctx.client.db('audnexus')
	papr.initialize(db)
	bookHistoryStore.configure(ctx.client)
	for (const model of papr.models.values()) {
		try {
			await papr.updateSchema(model)
		} catch (error) {
			// Papr's existence check and createCollection can race on a fresh
			// namespace. Retry only this model and only NamespaceExists; the
			// second pass collMods the existing namespace with its validator.
			if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 48)
				throw error
			await papr.updateSchema(model)
		}
	}
	const report = await reconcileIndexes(db, {
		mode,
		emit: (outcome) => console.info(JSON.stringify({ type: 'database_index', ...outcome }))
	})
	console.info(
		JSON.stringify({
			type: 'database_indexes_ready',
			count: report.outcomes.length,
			extras: report.extras
		})
	)
}

export default papr
