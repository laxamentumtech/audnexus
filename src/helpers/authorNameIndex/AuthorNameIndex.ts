import pino from 'pino'

import AuthorModel from '#config/models/Author'
import { foldName } from '#helpers/utils/foldName'

interface AuthorRow {
	asin: string
	name: string
	aliases?: string[]
}

interface AuthorNameIndexEntry {
	asin?: string
	candidates?: string[]
}

class AuthorNameIndex {
	logger = pino({ name: 'AuthorNameIndex' })
	private index: Map<string, Set<string>> | undefined
	// Reverse map: ASIN -> folded-name keys the ASIN contributes, so an
	// ASIN-scoped refresh can drop that ASIN's contributions from a name
	// (pruning the key when its last ASIN is gone) before re-adding them.
	private asinToNames: Map<string, Set<string>>
	private buildPromise: Promise<void> | undefined
	private refreshPromise: Promise<void> | undefined
	// Bumped on every invalidate()/markDirty(); a build or refresh that
	// started under an older generation must not publish stale data after
	// it completes.
	private generation = 0
	// ASINs with a known DB change since last publication. A warm index
	// refreshes only these (ASIN-scoped query, never a full reload) before
	// serving a lookup.
	private dirtyAsins: Set<string>

	constructor() {
		this.asinToNames = new Map<string, Set<string>>()
		this.dirtyAsins = new Set<string>()
	}

	/**
	 * Whether the authors collection is initialized in papr. The model
	 * starts with an abstract `find` that throws 'Collection is not
	 * initialized!'; papr.initialize() replaces it with the real
	 * implementation. Callers use this to skip work that would only log
	 * noise (e.g. enrichment during legacy network tests).
	 */
	isReady(): boolean {
		const find = AuthorModel.find
		return typeof find === 'function' && find.name !== 'abstractMethod'
	}

	/**
	 * Resolves an author name (or one of its aliases) to a unique ASIN.
	 * Lazily builds the index on first use and awaits any in-flight build,
	 * so concurrent callers see a complete index rather than a
	 * built-but-empty one. A warm index with pending author writes is
	 * refreshed (ASIN-scoped) before the lookup. A build or refresh
	 * failure degrades to not-found and the next call retries the same
	 * kind of load. Never throws.
	 * @returns {{ asin }} unique match | {{ candidates }} ambiguous match | {{}} not found
	 */
	async resolve(name: string): Promise<AuthorNameIndexEntry> {
		try {
			const index = await this.ensureIndex()
			if (!index) return {}
			const asins = index.get(foldName(name))
			if (!asins) return {}
			const sorted = [...asins].sort()
			if (sorted.length === 1) return { asin: sorted[0] }
			return { candidates: sorted }
		} catch (error) {
			this.logger.error(
				`[AuthorNameIndex] Failed to resolve author name: ${error instanceof Error ? error.message : error}`
			)
			return {}
		}
	}

	/**
	 * Ensures a built index is available and returns the map to read from,
	 * so no invalidation can clear the cache between the availability check
	 * and the lookup. Awaits any in-flight build; if that build was
	 * invalidated mid-flight (or failed) so nothing was published, starts a
	 * fresh build. A warm-but-dirty index is refreshed with an
	 * ASIN-scoped query (single-flight) before being served: one refresh
	 * attempt per call, and a dirty index is never served — a failed or
	 * stale refresh degrades to not-found, with the dirty state retained so
	 * the next call retries the ASIN-scoped refresh (never a full
	 * collection load).
	 */
	private async ensureIndex(): Promise<Map<string, Set<string>> | undefined> {
		for (let attempt = 0; ; attempt++) {
			const index = this.index
			if (index) {
				if (this.dirtyAsins.size === 0) return index
				// Warm but dirty: one ASIN-scoped refresh, then serve only
				// if it cleared the dirty set.
				await (this.refreshPromise ?? this.startRefresh())
				return this.dirtyAsins.size === 0 ? this.index : undefined
			}
			// Cold: attempt 0 builds; a failed build (nothing published) is
			// retried once (bounded) before degrading to not-found.
			await (this.buildPromise ?? this.startBuild())
			if (attempt > 0) return this.index
		}
	}

	/**
	 * Loads all authors (asin, name, and aliases only) and rebuilds the
	 * folded name index. Single-flight: concurrent calls share one
	 * in-flight build.
	 */
	build(): Promise<void> {
		return this.buildPromise ?? this.startBuild()
	}

	/**
	 * Records that the given ASIN's DB rows changed. Advances the
	 * publication generation so in-flight builds/refreshes go stale, but
	 * does NOT discard a warm index: the next resolve refreshes only this
	 * ASIN's contributions instead of reloading the collection.
	 */
	markDirty(asin: string): void {
		this.dirtyAsins.add(asin)
		this.generation += 1
	}

	/**
	 * Drops the built index so the next resolve rebuilds it. Also marks any
	 * in-flight build/refresh stale so it cannot republish data read before
	 * the invalidation, and clears the dirty set (a full rebuild re-reads
	 * everything).
	 */
	invalidate(): void {
		this.index = undefined
		this.asinToNames = new Map<string, Set<string>>()
		this.dirtyAsins.clear()
		this.generation += 1
	}

	private addName(
		index: Map<string, Set<string>>,
		asinToNames: Map<string, Set<string>>,
		name: string,
		asin: string
	): void {
		const key = foldName(name)
		const asins = index.get(key) ?? new Set<string>()
		asins.add(asin)
		index.set(key, asins)
		const keys = asinToNames.get(asin) ?? new Set<string>()
		keys.add(key)
		asinToNames.set(asin, keys)
	}

	private startBuild(): Promise<void> {
		const generation = this.generation
		const build = (async () => {
			const index = new Map<string, Set<string>>()
			const asinToNames = new Map<string, Set<string>>()
			const authors = (await AuthorModel.find(
				{},
				{
					projection: { asin: 1, name: 1, aliases: 1 }
				}
			)) as AuthorRow[]
			for (const author of authors) {
				this.addName(index, asinToNames, author.name, author.asin)
				for (const alias of author.aliases ?? []) {
					this.addName(index, asinToNames, alias, author.asin)
				}
			}
			// Publish only after a successful build, and only if no
			// invalidation happened while this build was in flight.
			if (generation === this.generation) {
				this.index = index
				this.asinToNames = asinToNames
				this.dirtyAsins.clear()
			}
		})().catch((error) => {
			this.logger.error(
				`[AuthorNameIndex] Failed to build index: ${error instanceof Error ? error.message : error}`
			)
			// A failed build must not poison the process: clear whatever
			// was published so the next resolve retries the build.
			this.index = undefined
			this.asinToNames = new Map<string, Set<string>>()
		})
		this.buildPromise = build
		build.finally(() => {
			if (this.buildPromise === build) {
				this.buildPromise = undefined
			}
		})
		return build
	}

	/**
	 * Refreshes the dirty ASINs in a warm index: reads all regional rows
	 * for those ASINs (one projected query), replaces each ASIN's
	 * name/alias contributions (dropping removed ones and pruning empty
	 * name sets), and publishes synchronously — no intervening awaits —
	 * only when the generation is still valid. The refresh stages in an
	 * isolated index copy (affected name Sets are cloned before mutation)
	 * so a stale refresh leaves the published index untouched. On failure
	 * the dirty state
	 * is retained for the next lookup; the index keeps serving and the
	 * next attempt is another ASIN-scoped refresh, not a full load.
	 */
	private startRefresh(): Promise<void> {
		const generation = this.generation
		const refresh = (async () => {
			const dirtyAsins = [...this.dirtyAsins]
			const authors = (await AuthorModel.find(
				{ asin: { $in: dirtyAsins } },
				{
					projection: { asin: 1, name: 1, aliases: 1 }
				}
			)) as AuthorRow[]
			const index = this.index
			const asinToNames = this.asinToNames
			if (!index || !asinToNames) return
			const nextIndex = new Map(index)
			const nextAsinToNames = new Map(asinToNames)
			// Stage the refresh in an isolated copy: clone each affected
			// name's ASIN Set before the first mutation, so a stale
			// refresh (generation bumped mid-flight) never leaves the
			// published index mutated.
			const affectedKeys = new Set<string>()
			for (const asin of dirtyAsins) {
				for (const key of asinToNames.get(asin) ?? []) {
					affectedKeys.add(key)
				}
			}
			for (const key of affectedKeys) {
				const asins = index.get(key)
				if (asins) nextIndex.set(key, new Set(asins))
			}
			// Drop each affected ASIN's old contributions, and reset its
			// reverse entry so addName below records only the new keys.
			for (const asin of dirtyAsins) {
				for (const key of asinToNames.get(asin) ?? []) {
					const asins = nextIndex.get(key)
					if (asins) {
						asins.delete(asin)
						if (asins.size === 0) nextIndex.delete(key)
					}
				}
				nextAsinToNames.delete(asin)
			}
			// Add the ASINs' current contributions from their regional rows
			// (ASINs with no remaining rows simply keep no reverse entry).
			// Clone-on-write: a Set still shared with the published index
			// is cloned before its first staged mutation, so a stale
			// refresh never mutates the live index through the re-add
			// path either.
			const addStaged = (name: string, asin: string) => {
				const key = foldName(name)
				let asins = nextIndex.get(key)
				if (asins && asins === index.get(key)) {
					asins = new Set(asins)
					nextIndex.set(key, asins)
				}
				if (!asins) {
					asins = new Set<string>()
					nextIndex.set(key, asins)
				}
				asins.add(asin)
				const keys = nextAsinToNames.get(asin) ?? new Set<string>()
				keys.add(key)
				nextAsinToNames.set(asin, keys)
			}
			for (const author of authors) {
				addStaged(author.name, author.asin)
				for (const alias of author.aliases ?? []) {
					addStaged(alias, author.asin)
				}
			}
			// Publish synchronously, only if no write landed mid-flight.
			if (generation === this.generation) {
				this.index = nextIndex
				this.asinToNames = nextAsinToNames
				for (const asin of dirtyAsins) {
					this.dirtyAsins.delete(asin)
				}
			}
		})().catch((error) => {
			this.logger.error(
				`[AuthorNameIndex] Failed to refresh author index: ${
					error instanceof Error ? error.message : error
				}`
			)
			// Keep the warm index and the dirty state: the next lookup
			// retries the ASIN-scoped refresh (never a full collection load).
		})
		this.refreshPromise = refresh
		refresh.finally(() => {
			if (this.refreshPromise === refresh) {
				this.refreshPromise = undefined
			}
		})
		return refresh
	}
}

export const authorNameIndex = new AuthorNameIndex()
