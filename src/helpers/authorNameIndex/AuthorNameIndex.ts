import pino from 'pino'

import AuthorModel from '#config/models/Author'

interface AuthorRow {
	asin: string
	name: string
	aliases?: string[]
}

interface AuthorNameIndexEntry {
	asin?: string
	candidates?: string[]
}

// Normalizes an author name into the index key: trims, collapses internal
// whitespace, and lowercases, so case and spacing variants of the same name
// fold onto a single ASIN set. Non-Latin scripts (e.g. Japanese) have no
// casing, so distinct spellings only merge when whitespace differs.
const foldName = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase()

// Folds a name (or alias) into the index key and merges the ASIN in. Keys
// that map to multiple ASINs resolve as ambiguous (candidates).
const addName = (index: Map<string, Set<string>>, name: string, asin: string): void => {
	const key = foldName(name)
	const asins = index.get(key) ?? new Set<string>()
	asins.add(asin)
	index.set(key, asins)
}

class AuthorNameIndex {
	logger = pino({ name: 'AuthorNameIndex' })
	private index: Map<string, Set<string>> | undefined
	private buildPromise: Promise<void> | undefined
	// Bumped on every invalidate(); a build that started under an older
	// generation must not publish stale data after it completes.
	private generation = 0

	/**
	 * Resolves an author name (or one of its aliases) to a unique ASIN.
	 * Lazily builds the index on first use and awaits any in-flight build,
	 * so concurrent callers see a complete index rather than a
	 * built-but-empty one. A build failure degrades to not-found and the
	 * next call retries the build. Never throws.
	 * @returns {{ asin }} unique match | {{ candidates }} ambiguous match | {{}} not found
	 */
	async resolve(name: string): Promise<AuthorNameIndexEntry> {
		try {
			const index = await this.ensureIndex()
			const asins = index?.get(foldName(name))
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
	 * fresh build. Bounded to a single retry so a persistently failing DB
	 * degrades to not-found instead of looping; returns `undefined` in that
	 * case and when a second concurrent invalidation lands in the same call.
	 */
	private async ensureIndex(): Promise<Map<string, Set<string>> | undefined> {
		for (let attempt = 0; ; attempt++) {
			const index = this.index
			if (index) return index
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
	 * Drops the built index so the next resolve rebuilds it. Also marks any
	 * in-flight build stale so it cannot republish data read before the
	 * invalidation.
	 */
	invalidate(): void {
		this.index = undefined
		this.generation += 1
	}

	private startBuild(): Promise<void> {
		const generation = this.generation
		const build = (async () => {
			const index = new Map<string, Set<string>>()
			const authors = (await AuthorModel.find(
				{},
				{
					projection: { asin: 1, name: 1, aliases: 1 }
				}
			)) as AuthorRow[]
			for (const author of authors) {
				addName(index, author.name, author.asin)
				for (const alias of author.aliases ?? []) {
					addName(index, alias, author.asin)
				}
			}
			// Publish only after a successful build, and only if no
			// invalidation happened while this build was in flight.
			if (generation === this.generation) {
				this.index = index
			}
		})().catch((error) => {
			this.logger.error(
				`[AuthorNameIndex] Failed to build index: ${error instanceof Error ? error.message : error}`
			)
			// A failed build must not poison the process: clear whatever
			// was published so the next resolve retries the build.
			this.index = undefined
		})
		this.buildPromise = build
		build.finally(() => {
			if (this.buildPromise === build) {
				this.buildPromise = undefined
			}
		})
		return build
	}
}

export const authorNameIndex = new AuthorNameIndex()
