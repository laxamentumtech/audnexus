import type { FastifyRedis } from '@fastify/redis'
import type { FastifyBaseLogger } from 'fastify'
import type { Redis } from 'ioredis'

import AuthorModel from '#config/models/Author'
import BookModel from '#config/models/Book'
import ChapterModel from '#config/models/Chapter'
import { getPerformanceConfig } from '#config/performance'
import AuthorShowHelper from '#helpers/routes/AuthorShowHelper'
import BookShowHelper from '#helpers/routes/BookShowHelper'
import ChapterShowHelper from '#helpers/routes/ChapterShowHelper'
import { type BatchProcessSummary, processBatchByRegion } from '#helpers/utils/batchProcessor'
import { jitteredSleep } from '#helpers/utils/jitteredSleep'
import {
	ASIN_REGION_PROJECTION,
	type DocumentWithRegion,
	iterateKeyset,
	keysetFindAdapter
} from '#helpers/utils/keyset'
import { NoticeUpdateScheduled } from '#static/messages'

// Maximum per-region concurrency limit
const MAX_PER_REGION_CONCURRENCY = 5

/**
 * Merge a per-batch summary into the aggregate summary, preserving the
 * single end-of-run log line the scheduler emitted before pagination.
 */
function mergeSummary(target: BatchProcessSummary, batch: BatchProcessSummary): void {
	target.total += batch.total
	target.success += batch.success
	target.failures += batch.failures
	for (const [region, count] of Object.entries(batch.regions)) {
		target.regions[region] = (target.regions[region] ?? 0) + count
	}
	target.maxConcurrencyObserved = Math.max(
		target.maxConcurrencyObserved,
		batch.maxConcurrencyObserved
	)
}

class UpdateScheduler {
	redis: Redis | null
	logger: FastifyBaseLogger
	constructor(redis: Redis | null, logger: FastifyBaseLogger) {
		this.redis = redis
		this.logger = logger
	}

	/**
	 * Walk a collection in `_id`-ordered batches, invoking the callback for each
	 * batch. Memory stays bounded to one batch regardless of collection size —
	 * papr's find() drains the whole cursor into a single array, so a
	 * collection-wide query without a limit OOMs on multi-million-document
	 * collections. Delegates to the shared `iterateKeyset` primitive.
	 */
	private async processAllAsins(
		model: typeof AuthorModel | typeof BookModel | typeof ChapterModel,
		processBatch: (batch: DocumentWithRegion[]) => Promise<void>
	): Promise<void> {
		const batchSize = getPerformanceConfig().SCHEDULER_BATCH_SIZE
		await iterateKeyset(
			keysetFindAdapter(model),
			{ projection: ASIN_REGION_PROJECTION, batchSize },
			processBatch
		)
	}

	/**
	 * Process a single author update
	 */
	private async processAuthor(
		author: DocumentWithRegion,
		options: { withDelay: boolean } = { withDelay: false }
	): Promise<void> {
		const helper = new AuthorShowHelper(
			author.asin,
			{ region: author.region ?? 'us', update: '1' },
			this.redis as unknown as FastifyRedis | null
		)
		try {
			await helper.handler()
		} finally {
			if (options.withDelay) {
				await jitteredSleep()
			}
		}
	}

	/**
	 * Process a single book update
	 */
	private async processBook(
		book: DocumentWithRegion,
		options: { withDelay: boolean } = { withDelay: false }
	): Promise<void> {
		const helper = new BookShowHelper(
			book.asin,
			{ region: book.region ?? 'us', update: '1' },
			this.redis as unknown as FastifyRedis | null
		)
		try {
			await helper.handler()
		} finally {
			if (options.withDelay) {
				await jitteredSleep()
			}
		}
	}

	/**
	 * Process a single chapter update
	 */
	private async processChapter(
		chapter: DocumentWithRegion,
		options: { withDelay: boolean } = { withDelay: false }
	): Promise<void> {
		const helper = new ChapterShowHelper(
			chapter.asin,
			{ region: chapter.region ?? 'us', update: '1' },
			this.redis as unknown as FastifyRedis | null
		)
		try {
			await helper.handler()
		} finally {
			if (options.withDelay) {
				await jitteredSleep()
			}
		}
	}

	private createEmptySummary(): BatchProcessSummary {
		return { total: 0, success: 0, failures: 0, regions: {}, maxConcurrencyObserved: 0 }
	}

	/**
	 * Walk one collection in bounded `_id` batches, updating every document via
	 * the per-document callback. Uses parallel processing with per-region
	 * concurrency control when USE_PARALLEL_SCHEDULER is enabled; otherwise
	 * processes sequentially with a delay between requests.
	 */
	private async runPaginatedUpdate(
		label: string,
		model: typeof AuthorModel | typeof BookModel | typeof ChapterModel,
		processOne: (doc: DocumentWithRegion, options: { withDelay: boolean }) => Promise<void>
	): Promise<BatchProcessSummary> {
		const config = getPerformanceConfig()
		if (!config.USE_PARALLEL_SCHEDULER) {
			await this.processAllAsins(model, async (docs) => {
				for (const doc of docs) {
					try {
						await processOne(doc, { withDelay: true })
					} catch (error) {
						this.logger.error(error)
					}
				}
			})
			return this.createEmptySummary()
		}
		const perRegionLimit = Math.min(config.SCHEDULER_CONCURRENCY, MAX_PER_REGION_CONCURRENCY)
		const summary = this.createEmptySummary()
		await this.processAllAsins(model, async (docs) => {
			const { summary: batchSummary } = await processBatchByRegion(
				docs,
				async (doc) => {
					try {
						await processOne(doc, { withDelay: false })
					} catch (error) {
						this.logger.error(error)
						throw error
					}
				},
				{ concurrency: config.SCHEDULER_CONCURRENCY, maxPerRegion: perRegionLimit }
			)
			mergeSummary(summary, batchSummary)
		})
		this.logBatchSummary(label, summary, config.SCHEDULER_CONCURRENCY, perRegionLimit)
		return summary
	}

	/**
	 * Update all authors
	 * Uses parallel processing when USE_PARALLEL_SCHEDULER feature flag is enabled
	 */
	async updateAuthors(aggregate?: BatchProcessSummary): Promise<void> {
		this.logger.debug(NoticeUpdateScheduled('Authors'))
		this.logMemoryUsage('authors:start')
		const summary = await this.runPaginatedUpdate('Authors', AuthorModel, (author, options) =>
			this.processAuthor(author, options)
		)
		if (aggregate) mergeSummary(aggregate, summary)
		this.logMemoryUsage('authors:complete')
	}

	/**
	 * Update all books
	 * Uses parallel processing when USE_PARALLEL_SCHEDULER feature flag is enabled
	 */
	async updateBooks(aggregate?: BatchProcessSummary): Promise<void> {
		this.logger.debug(NoticeUpdateScheduled('Books'))
		this.logMemoryUsage('books:start')
		const summary = await this.runPaginatedUpdate('Books', BookModel, (book, options) =>
			this.processBook(book, options)
		)
		if (aggregate) mergeSummary(aggregate, summary)
		this.logMemoryUsage('books:complete')
	}

	/**
	 * Update all chapters
	 * Uses parallel processing when USE_PARALLEL_SCHEDULER feature flag is enabled
	 */
	async updateChapters(aggregate?: BatchProcessSummary): Promise<void> {
		this.logger.debug(NoticeUpdateScheduled('Chapters'))
		this.logMemoryUsage('chapters:start')
		const summary = await this.runPaginatedUpdate('Chapters', ChapterModel, (chapter, options) =>
			this.processChapter(chapter, options)
		)
		if (aggregate) mergeSummary(aggregate, summary)
		this.logMemoryUsage('chapters:complete')
	}

	/**
	 * Update all (authors, books, chapters)
	 * Sequential execution between categories
	 */
	async updateAll(): Promise<BatchProcessSummary> {
		this.logMemoryUsage('updateAll:start')
		const summary = this.createEmptySummary()
		await this.updateAuthors(summary)
		await this.updateBooks(summary)
		await this.updateChapters(summary)
		this.logMemoryUsage('updateAll:complete')
		return summary
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
