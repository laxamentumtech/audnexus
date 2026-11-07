import type { FastifyRedis } from '@fastify/redis'
import type { FastifyBaseLogger } from 'fastify'
import type { Redis } from 'ioredis'
import type { ObjectId } from 'mongodb'

import AuthorModel from '#config/models/Author'
import BookModel from '#config/models/Book'
import ChapterModel from '#config/models/Chapter'
import { getPerformanceConfig } from '#config/performance'
import AuthorShowHelper from '#helpers/routes/AuthorShowHelper'
import BookShowHelper from '#helpers/routes/BookShowHelper'
import ChapterShowHelper from '#helpers/routes/ChapterShowHelper'
import { registerSuccess, sleepCooldown } from '#helpers/utils/adaptiveCooldown'
import {
	type BatchProcessSummary,
	normalizeRegion,
	processBatchByRegion
} from '#helpers/utils/batchProcessor'
import { jitteredSleep } from '#helpers/utils/jitteredSleep'
import {
	ASIN_REGION_UPDATED_PROJECTION,
	iterateStaleKeyset,
	type StaleDocumentWithRegion,
	staleKeysetFindAdapter
} from '#helpers/utils/keyset'
import { UpstreamGoneError } from '#helpers/utils/upstreamGone'
import { withDeadline } from '#helpers/utils/withDeadline'
import { NoticeUpdateScheduled } from '#static/messages'

// Maximum per-region concurrency limit
const MAX_PER_REGION_CONCURRENCY = 5

/** What one document's update did: papr wrote it (`updated`), the upstream had
 * nothing usable but the row is not dead (`unchanged` — recency gate, swallowed
 * REGION_UNAVAILABLE/PRODUCT_DELISTED, no chapters), or the page no longer
 * exists (`gone`). Only `unchanged` and `gone` are marked checked; failures are not. */
type ItemOutcome = 'updated' | 'unchanged' | 'gone'

/** Per-pass result, replacing the aggregate-summary plumbing. */
export interface PassSummary {
	total: number
	updated: number
	unchanged: number
	gone: number
	failures: number
}

class UpdateScheduler {
	redis: Redis | null
	logger: FastifyBaseLogger
	constructor(redis: Redis | null, logger: FastifyBaseLogger) {
		this.redis = redis
		this.logger = logger
	}

	/**
	 * Walk a collection's staleness window in `{ updatedAt: 1, _id: 1 }`-ordered
	 * batches, invoking the callback for each batch. Memory stays bounded to one
	 * batch regardless of collection size. Delegates to the shared
	 * `iterateStaleKeyset` primitive.
	 */
	private async processStaleDocs(
		model: typeof AuthorModel | typeof BookModel | typeof ChapterModel,
		processBatch: (batch: StaleDocumentWithRegion[]) => Promise<boolean | void>
	): Promise<void> {
		const config = getPerformanceConfig()
		const staleBefore = new Date(Date.now() - config.UPDATE_THRESHOLD_DAYS * 86_400_000)
		await iterateStaleKeyset(
			staleKeysetFindAdapter(model),
			{
				projection: ASIN_REGION_UPDATED_PROJECTION,
				batchSize: config.SCHEDULER_BATCH_SIZE,
				staleBefore
			},
			processBatch
		)
	}

	/**
	 * Mark a stale row as checked without touching content: `$currentDate` is the
	 * one write that makes the row leave the staleness window the walk selects on.
	 * Cast matches the papr-generics bypass in keyset.ts (`$currentDate` is a
	 * standard Mongo operator papr's update type does not model).
	 */
	private async markChecked(
		model: typeof AuthorModel | typeof BookModel | typeof ChapterModel,
		id: ObjectId
	): Promise<void> {
		await (
			model as unknown as { updateOne: (filter: object, update: object) => Promise<unknown> }
		).updateOne({ _id: id }, { $currentDate: { updatedAt: true } })
	}

	/**
	 * Process a single author update
	 */
	private async processAuthor(
		author: StaleDocumentWithRegion,
		options: { withDelay: boolean } = { withDelay: false }
	): Promise<ItemOutcome> {
		const helper = new AuthorShowHelper(
			author.asin,
			{ region: author.region ?? 'us', update: '1' },
			this.redis as unknown as FastifyRedis | null,
			this.logger
		)
		try {
			const timeoutMs = getPerformanceConfig().SCHEDULER_ITEM_TIMEOUT_MS
			await withDeadline(helper.handler(), timeoutMs, `author ${author.asin}`)
			// Cooldown decay still keys on a real upstream fetch…
			if (helper.fetchedFreshData) registerSuccess()
			// …but "did the row move into the staleness window's past" keys on
			// persistence, not on the fetch.
			return helper.persisted ? 'updated' : 'unchanged'
		} catch (error) {
			if (error instanceof UpstreamGoneError) return 'gone'
			throw error
		} finally {
			// Pacing jitter is a serial-walk concern (items are sequential
			// there); in parallel mode the per-region concurrency limit is the
			// pacing.
			if (options.withDelay) {
				await jitteredSleep()
			}
			// Adaptive upstream-pressure cooldown (see adaptiveCooldown.ts):
			// runs in BOTH modes and after failures. Sits outside the item
			// deadline on purpose: a 2-hour cooldown must not be cut.
			await sleepCooldown()
		}
	}

	/**
	 * Process a single book update
	 */
	private async processBook(
		book: StaleDocumentWithRegion,
		options: { withDelay: boolean } = { withDelay: false }
	): Promise<ItemOutcome> {
		const helper = new BookShowHelper(
			book.asin,
			{ region: book.region ?? 'us', update: '1' },
			this.redis as unknown as FastifyRedis | null,
			this.logger
		)
		try {
			const timeoutMs = getPerformanceConfig().SCHEDULER_ITEM_TIMEOUT_MS
			await withDeadline(helper.handler(), timeoutMs, `book ${book.asin}`)
			// Fresh fetch → relax the upstream cooldown (see processAuthor).
			if (helper.fetchedFreshData) registerSuccess()
			return helper.persisted ? 'updated' : 'unchanged'
		} catch (error) {
			if (error instanceof UpstreamGoneError) return 'gone'
			throw error
		} finally {
			// Pacing jitter is serial-only (see processAuthor).
			if (options.withDelay) {
				await jitteredSleep()
			}
			// Cooldown runs in BOTH modes and after failures (see processAuthor).
			await sleepCooldown()
		}
	}

	/**
	 * Process a single chapter update
	 */
	private async processChapter(
		chapter: StaleDocumentWithRegion,
		options: { withDelay: boolean } = { withDelay: false }
	): Promise<ItemOutcome> {
		const helper = new ChapterShowHelper(
			chapter.asin,
			{ region: chapter.region ?? 'us', update: '1' },
			this.redis as unknown as FastifyRedis | null,
			this.logger
		)
		try {
			const timeoutMs = getPerformanceConfig().SCHEDULER_ITEM_TIMEOUT_MS
			await withDeadline(helper.handler(), timeoutMs, `chapters ${chapter.asin}`)
			// Fresh fetch → relax the upstream cooldown (see processAuthor).
			if (helper.fetchedFreshData) registerSuccess()
			return helper.persisted ? 'updated' : 'unchanged'
		} catch (error) {
			if (error instanceof UpstreamGoneError) return 'gone'
			throw error
		} finally {
			// Pacing jitter is serial-only (see processAuthor).
			if (options.withDelay) {
				await jitteredSleep()
			}
			// Cooldown runs in BOTH modes and after failures (see processAuthor).
			await sleepCooldown()
		}
	}

	/**
	 * Walk one collection's staleness window in bounded `{ updatedAt: 1, _id: 1 }`
	 * batches, updating every document via the per-document callback. Uses
	 * parallel processing with per-region concurrency control when
	 * USE_PARALLEL_SCHEDULER is enabled; otherwise processes sequentially with a
	 * delay between requests. Honors the SCHEDULER_MAX_ITEMS cap by ending the
	 * walk (the iterator stops when the batch callback returns `false`).
	 */
	private async runPaginatedUpdate(
		label: string,
		model: typeof AuthorModel | typeof BookModel | typeof ChapterModel,
		processOne: (
			doc: StaleDocumentWithRegion,
			options: { withDelay: boolean }
		) => Promise<ItemOutcome>
	): Promise<PassSummary> {
		const config = getPerformanceConfig()
		const batchSummary = this.createEmptySummary()
		let total = 0
		let updated = 0
		let unchanged = 0
		let gone = 0
		let failures = 0
		const hitCap = () => config.SCHEDULER_MAX_ITEMS > 0 && total >= config.SCHEDULER_MAX_ITEMS
		// Per-region cap for the parallel dispatch; declared here so the
		// post-walk summary (below the if/else) can log it for both modes.
		const perRegionLimit = Math.min(config.SCHEDULER_CONCURRENCY, MAX_PER_REGION_CONCURRENCY)

		if (!config.USE_PARALLEL_SCHEDULER) {
			await this.processStaleDocs(model, async (docs) => {
				this.logger.debug(`${label} batch: ${docs.length} items`)
				batchSummary.total += docs.length
				for (const doc of docs) {
					if (hitCap()) break
					const region = normalizeRegion(doc.region)
					total += 1
					batchSummary.regions[region] = (batchSummary.regions[region] ?? 0) + 1
					try {
						const outcome = await processOne(doc, { withDelay: true })
						batchSummary.success += 1
						if (outcome === 'updated') {
							updated += 1
						} else {
							if (outcome === 'gone') {
								gone += 1
								this.logger.debug(`${label} item gone upstream: asin=${doc.asin} region=${region}`)
							} else {
								unchanged += 1
							}
							await this.markChecked(model, doc._id)
						}
					} catch (error) {
						this.logger.error(error)
						batchSummary.failures += 1
						failures += 1
					}
				}
				this.logger.info(
					`${label} pass: checked=${total} updated=${updated} unchanged=${unchanged} gone=${gone} failures=${failures}`
				)
				// Decided from `total`, not from a "saw a later item" flag: the
				// item that brings total to the cap is usually the last item of the
				// batch, which would otherwise return undefined and let the
				// iterator fetch one more page.
				return hitCap() ? false : undefined
			})
		} else {
			await this.processStaleDocs(model, async (docs) => {
				// The cap must truncate the batch BEFORE dispatch (the default
				// batch is 1,000, so a post-hoc check cannot honor a small
				// allowance).
				const remaining =
					config.SCHEDULER_MAX_ITEMS > 0 ? config.SCHEDULER_MAX_ITEMS - total : docs.length
				const slice = remaining < docs.length ? docs.slice(0, remaining) : docs
				if (slice.length === 0) return false
				this.logger.debug(`${label} batch: ${slice.length} items`)
				batchSummary.total += slice.length
				const { summary } = await processBatchByRegion(
					slice,
					async (doc) => {
						const region = normalizeRegion(doc.region)
						total += 1
						batchSummary.regions[region] = (batchSummary.regions[region] ?? 0) + 1
						try {
							const outcome = await processOne(doc, { withDelay: false })
							batchSummary.success += 1
							if (outcome === 'updated') {
								updated += 1
							} else {
								if (outcome === 'gone') {
									gone += 1
									this.logger.debug(
										`${label} item gone upstream: asin=${doc.asin} region=${region}`
									)
								} else {
									unchanged += 1
								}
								await this.markChecked(model, doc._id)
							}
							return outcome
						} catch (error) {
							this.logger.error(error)
							batchSummary.failures += 1
							failures += 1
							return undefined
						}
					},
					{ concurrency: config.SCHEDULER_CONCURRENCY, maxPerRegion: perRegionLimit }
				)
				this.logger.info(
					`${label} pass: checked=${total} updated=${updated} unchanged=${unchanged} gone=${gone} failures=${failures}`
				)
				batchSummary.maxConcurrencyObserved = summary.maxConcurrencyObserved
				return hitCap() ? false : undefined
			})
		}

		this.logBatchSummary(label, batchSummary, config.SCHEDULER_CONCURRENCY, perRegionLimit)
		this.logger.info(
			`${label} pass complete: checked=${total} updated=${updated} unchanged=${unchanged} gone=${gone} failures=${failures}`
		)
		return { total, updated, unchanged, gone, failures }
	}

	/**
	 * Update all stale authors
	 * Uses parallel processing when USE_PARALLEL_SCHEDULER feature flag is enabled
	 */
	async updateAuthors(): Promise<PassSummary> {
		this.logger.debug(NoticeUpdateScheduled('Authors'))
		this.logMemoryUsage('authors:start')
		const pass = await this.runPaginatedUpdate('Authors', AuthorModel, (author, options) =>
			this.processAuthor(author, options)
		)
		this.logMemoryUsage('authors:complete')
		return pass
	}

	/**
	 * Update all stale books
	 * Uses parallel processing when USE_PARALLEL_SCHEDULER feature flag is enabled
	 */
	async updateBooks(): Promise<PassSummary> {
		this.logger.debug(NoticeUpdateScheduled('Books'))
		this.logMemoryUsage('books:start')
		const pass = await this.runPaginatedUpdate('Books', BookModel, (book, options) =>
			this.processBook(book, options)
		)
		this.logMemoryUsage('books:complete')
		return pass
	}

	/**
	 * Update all stale chapters
	 * Uses parallel processing when USE_PARALLEL_SCHEDULER feature flag is enabled
	 */
	async updateChapters(): Promise<PassSummary> {
		this.logger.debug(NoticeUpdateScheduled('Chapters'))
		this.logMemoryUsage('chapters:start')
		const pass = await this.runPaginatedUpdate('Chapters', ChapterModel, (chapter, options) =>
			this.processChapter(chapter, options)
		)
		this.logMemoryUsage('chapters:complete')
		return pass
	}

	private createEmptySummary(): BatchProcessSummary {
		return { total: 0, success: 0, failures: 0, regions: {}, maxConcurrencyObserved: 0 }
	}

	private logBatchSummary(
		label: string,
		summary: BatchProcessSummary,
		concurrency: number,
		perRegionLimit: number
	) {
		this.logger.debug(
			`${label} batch complete: total=${summary.total} success=${summary.success} failures=${summary.failures}`
		)
		this.logger.debug(
			`${label} batch regions: ${Object.keys(summary.regions).length} maxConcurrency=${summary.maxConcurrencyObserved}`
		)
		if (summary.maxConcurrencyObserved > concurrency) {
			this.logger.warn(
				`${label} batch exceeded configured concurrency (${summary.maxConcurrencyObserved}/${concurrency})`
			)
		}
		this.logger.debug(`${label} batch per-region limit: ${perRegionLimit}`)
	}

	private logMemoryUsage(stage: string) {
		const usage = process.memoryUsage()
		const toMb = (value: number) => Math.round((value / 1024 / 1024) * 100) / 100
		this.logger.debug(
			`UpdateScheduler memory ${stage}: heapUsed=${toMb(usage.heapUsed)}MB rss=${toMb(usage.rss)}MB`
		)
	}
}

export default UpdateScheduler
