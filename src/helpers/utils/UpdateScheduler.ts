import { FastifyRedis } from '@fastify/redis'
import { FastifyBaseLogger } from 'fastify'
import type { ObjectId } from 'mongodb'
import type { ProjectionType } from 'papr'
import { AsyncTask, LongIntervalJob } from 'toad-scheduler'

import AuthorModel from '#config/models/Author'
import BookModel, { type BookDocument } from '#config/models/Book'
import ChapterModel from '#config/models/Chapter'
import { getPerformanceConfig } from '#config/performance'
import AuthorShowHelper from '#helpers/routes/AuthorShowHelper'
import BookShowHelper from '#helpers/routes/BookShowHelper'
import ChapterShowHelper from '#helpers/routes/ChapterShowHelper'
import { type BatchProcessSummary, processBatchByRegion } from '#helpers/utils/batchProcessor'
import { NoticeUpdateScheduled } from '#static/messages'

const waitFor = (ms: number) => new Promise((r) => setTimeout(r, ms))
// Wait for between 0 and 5 seconds
const randomWait = () => waitFor(Math.floor(Math.random() * 5000))

// Maximum per-region concurrency limit
const MAX_PER_REGION_CONCURRENCY = 5

// Document types with region
interface DocumentWithRegion {
	_id: ObjectId
	asin: string
	region?: string | null
}

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
	interval: number
	redis: FastifyRedis
	logger: FastifyBaseLogger
	constructor(interval: number, redis: FastifyRedis, logger: FastifyBaseLogger) {
		this.interval = interval
		this.redis = redis
		this.logger = logger
	}

	/**
	 * Walk a collection in `_id`-ordered batches, invoking the callback for each
	 * batch. Memory stays bounded to one batch regardless of collection size —
	 * papr's find() drains the whole cursor into a single array, so a
	 * collection-wide query without a limit OOMs on multi-million-document
	 * collections.
	 */
	private async processAllAsins(
		model: typeof AuthorModel | typeof BookModel | typeof ChapterModel,
		processBatch: (batch: DocumentWithRegion[]) => Promise<void>
	): Promise<void> {
		const batchSize = getPerformanceConfig().SCHEDULER_BATCH_SIZE
		const projection = { asin: 1, region: 1 }
		type BatchDoc = ProjectionType<BookDocument, typeof projection>
		let lastId: ObjectId | null = null
		// The three models expose the same find() shape for this projection; the
		// cast avoids a union-of-models call that TS cannot resolve.
		const findModel = model as typeof BookModel
		while (true) {
			const batch: BatchDoc[] = await findModel.find(lastId ? { _id: { $gt: lastId } } : {}, {
				projection,
				sort: { _id: 1 },
				limit: batchSize
			})
			if (batch.length === 0) break
			await processBatch(batch)
			lastId = batch[batch.length - 1]._id
		}
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
			this.redis
		)
		try {
			await helper.handler()
		} finally {
			if (options.withDelay) {
				await randomWait()
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
			this.redis
		)
		try {
			await helper.handler()
		} finally {
			if (options.withDelay) {
				await randomWait()
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
			this.redis
		)
		try {
			await helper.handler()
		} finally {
			if (options.withDelay) {
				await randomWait()
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
	): Promise<void> {
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
			return
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
	}

	/**
	 * Update all authors
	 * Uses parallel processing when USE_PARALLEL_SCHEDULER feature flag is enabled
	 */
	async updateAuthors(): Promise<void> {
		this.logger.debug(NoticeUpdateScheduled('Authors'))
		this.logMemoryUsage('authors:start')
		await this.runPaginatedUpdate('Authors', AuthorModel, (author, options) =>
			this.processAuthor(author, options)
		)
		this.logMemoryUsage('authors:complete')
	}

	/**
	 * Update all books
	 * Uses parallel processing when USE_PARALLEL_SCHEDULER feature flag is enabled
	 */
	async updateBooks(): Promise<void> {
		this.logger.debug(NoticeUpdateScheduled('Books'))
		this.logMemoryUsage('books:start')
		await this.runPaginatedUpdate('Books', BookModel, (book, options) =>
			this.processBook(book, options)
		)
		this.logMemoryUsage('books:complete')
	}

	/**
	 * Update all chapters
	 * Uses parallel processing when USE_PARALLEL_SCHEDULER feature flag is enabled
	 */
	async updateChapters(): Promise<void> {
		this.logger.debug(NoticeUpdateScheduled('Chapters'))
		this.logMemoryUsage('chapters:start')
		await this.runPaginatedUpdate('Chapters', ChapterModel, (chapter, options) =>
			this.processChapter(chapter, options)
		)
		this.logMemoryUsage('chapters:complete')
	}

	/**
	 * Update all (authors, books, chapters)
	 * Sequential execution between categories
	 */
	async updateAll(): Promise<void> {
		this.logMemoryUsage('updateAll:start')
		await this.updateAuthors()
		await this.updateBooks()
		await this.updateChapters()
		this.logMemoryUsage('updateAll:complete')
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

	updateAllTask() {
		return new AsyncTask(
			'updateAll',
			() => {
				return this.updateAll().then((res) => res)
			},
			(err) => {
				this.logger.error(err)
			}
		)
	}

	updateAllJob() {
		return new LongIntervalJob(
			{ days: this.interval, runImmediately: true },
			this.updateAllTask(),
			{
				id: 'id_1',
				preventOverrun: true
			}
		)
	}
}

export default UpdateScheduler
