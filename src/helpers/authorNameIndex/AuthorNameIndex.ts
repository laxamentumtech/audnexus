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
	private refreshPromise: Promise<boolean> | undefined
	// Bumped on invalidate(); a build or refresh that started before a
	// full invalidation must not publish stale data after it completes.
	// Per-ASIN writes do NOT advance this — they are tracked per ASIN in
	// dirtyVersions.
	private generation = 0
	// Version per ASIN with a known DB change since last publication (a
	// warm index refreshes only these — an ASIN-scoped query, never a
	// full reload — before serving a lookup). Bumped on every markDirty;
	// cleared per ASIN when a build/refresh's read covers that ASIN's
	// write (its version unchanged since the load started).
	private dirtyVersions: Map<string, number>

	constructor() {
		this.asinToNames = new Map<string, Set<string>>()
		this.dirtyVersions = new Map<string, number>()
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
	 * attempt per call. A successful refresh publishes its staged index and
	 * serves it even if other ASINs were dirtied mid-flight (those stay
	 * dirty for the next lookup); a failed refresh degrades to not-found,
	 * with the dirty state retained so the next call retries the
	 * ASIN-scoped refresh (never a full collection load); an invalidated
	 * refresh is discarded, and with the index dropped and the dirty state
	 * cleared, the next call does a full rebuild.
	 */
	private async ensureIndex(): Promise<Map<string, Set<string>> | undefined> {
		for (let attempt = 0; ; attempt++) {
			const index = this.index
			if (index) {
				if (this.dirtyVersions.size > 0) {
					// Warm but dirty: one ASIN-scoped refresh, then serve
					// only if it published (a failed/invalidated refresh
					// leaves the dirty set intact: not-found, retry next).
					const published = await (this.refreshPromise ?? this.startRefresh())
					return published ? this.index : undefined
				}
				return index
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
	 * Records that the given ASIN's DB rows changed. Bumps the per-ASIN
	 * dirty version (a later scoped refresh that reads this ASIN after this
	 * write will cover it), but does NOT advance the global generation:
	 * concurrent writes must not discard an in-flight refresh or build.
	 * Does NOT discard a warm index: the next resolve refreshes only the
	 * dirty ASINs' contributions instead of reloading the collection.
	 */
	markDirty(asin: string): void {
		this.dirtyVersions.set(asin, (this.dirtyVersions.get(asin) ?? 0) + 1)
	}

	/**
	 * Drops the built index so the next resolve rebuilds it. Also bumps the
	 * global generation so any in-flight build/refresh cannot republish
	 * data read before the invalidation, and clears the per-ASIN dirty
	 * state (a full rebuild re-reads everything).
	 */
	invalidate(): void {
		this.index = undefined
		this.asinToNames = new Map<string, Set<string>>()
		this.dirtyVersions.clear()
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
			// Per-ASIN versions at the start of the read; a markDirty for a
			// covered ASIN that bumps its version after this snapshot is NOT
			// covered by the read and must stay dirty.
			const versionsAtStart = new Map(this.dirtyVersions)
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
			// A full invalidation while the build was in flight means the
			// read data is stale: do not publish.
			if (generation !== this.generation) return
			// Publish even when ASINs were markDirty()'d mid-flight: the
			// build is a full-collection read, so it covers every ASIN as
			// of its read; only ASINs dirtied after the read started stay
			// dirty for a follow-up scoped refresh.
			this.index = index
			this.asinToNames = asinToNames
			const remaining = new Map<string, number>()
			for (const [asin, version] of this.dirtyVersions) {
				if (version !== versionsAtStart.get(asin)) remaining.set(asin, version)
			}
			this.dirtyVersions = remaining
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
	 * unless a full invalidation landed mid-flight (only a global
	 * generation bump discards the staged result). Writes (markDirty) do
	 * NOT discard the refresh: the staged index is built from an isolated
	 * copy of the read rows, and is always published when the generation
	 * is still valid. After publishing, an ASIN is un-dirtied only if its
	 * version is unchanged since the refresh started — ASINs dirtied later
	 * stay dirty for the next scoped refresh. On failure the dirty state
	 * is retained for the next lookup; the index keeps serving and the
	 * next attempt is another ASIN-scoped refresh, not a full load.
	 * @returns true if the staged index was published (even if other
	 * ASINs stayed dirty), false if it was discarded (invalidated/failed).
	 */
	private startRefresh(): Promise<boolean> {
		const generation = this.generation
		const refresh = (async () => {
			const dirtyAsins = [...this.dirtyVersions.keys()]
			// Per-ASIN versions at the start of the read: an ASIN whose
			// version is unchanged after the read was covered by it; a
			// version bumped during the read (or the appearance of a new
			// dirty ASIN) is not and must stay dirty.
			const versionsAtStart = new Map(this.dirtyVersions)
			const authors = (await AuthorModel.find(
				{ asin: { $in: dirtyAsins } },
				{
					projection: { asin: 1, name: 1, aliases: 1 }
				}
			)) as AuthorRow[]
			const index = this.index
			const asinToNames = this.asinToNames
			if (!index || !asinToNames) return false
			const nextIndex = new Map(index)
			const nextAsinToNames = new Map(asinToNames)
			// Stage the refresh in an isolated copy: clone each affected
			// name's ASIN Set before the first mutation, so a discarded
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
			// is cloned before its first staged mutation, so a discarded
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
			// A full invalidation while the refresh was in flight means the
			// read data is stale: discard the staged index.
			if (generation !== this.generation) return false
			// Publish synchronously, and un-dirty only the ASINs whose
			// versions the read covered; ASINs dirtied after the snapshot
			// stay dirty for the next scoped refresh.
			this.index = nextIndex
			this.asinToNames = nextAsinToNames
			const remaining = new Map<string, number>()
			for (const [asin, version] of this.dirtyVersions) {
				if (version !== versionsAtStart.get(asin)) remaining.set(asin, version)
			}
			this.dirtyVersions = remaining
			return true
		})().catch((error) => {
			this.logger.error(
				`[AuthorNameIndex] Failed to refresh author index: ${
					error instanceof Error ? error.message : error
				}`
			)
			// Keep the warm index and the dirty state: the next lookup
			// retries the ASIN-scoped refresh (never a full collection load).
			return false
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
