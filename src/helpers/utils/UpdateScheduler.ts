import { FastifyRedis } from '@fastify/redis'
import { FastifyBaseLogger } from 'fastify'
import { AsyncTask, LongIntervalJob } from 'toad-scheduler'

import AuthorModel from '#config/models/Author'
import BookModel from '#config/models/Book'
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
	asin: string
	region?: string | null
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

	getAllAuthorAsins = async () => {
		return AuthorModel.find(
			{},
			{ projection: { asin: 1, region: 1 }, sort: { updatedAt: -1 }, allowDiskUse: true }
		)
	}

	getAllBookAsins = async () => {
		return BookModel.find(
			{},
			{ projection: { asin: 1, region: 1 }, sort: { updatedAt: -1 }, allowDiskUse: true }
		)
	}

	getAllChapterAsins = async () => {
		return ChapterModel.find(
			{},
			{ projection: { asin: 1, region: 1 }, sort: { updatedAt: -1 }, allowDiskUse: true }
		)
	}

	/**
	 * Process a single author update
	 */
	private async processAuthor(author: DocumentWithRegion, addDelay = false): Promise<void> {
		const helper = new AuthorShowHelper(
			author.asin,
			{ region: author.region ?? 'us', update: '1' },
			this.redis
		)
		await helper.handler()
		if (addDelay) {
			await randomWait()
		}
	}

	/**
	 * Process a single book update
	 */
	private async processBook(book: DocumentWithRegion, addDelay = false): Promise<void> {
		const helper = new BookShowHelper(
			book.asin,
			{ region: book.region ?? 'us', update: '1' },
			this.redis
		)
		await helper.handler()
		if (addDelay) {
			await randomWait()
		}
	}

	/**
	 * Process a single chapter update
	 */
	private async processChapter(chapter: DocumentWithRegion, addDelay = false): Promise<void> {
		const helper = new ChapterShowHelper(
			chapter.asin,
			{ region: chapter.region ?? 'us', update: '1' },
			this.redis
		)
		await helper.handler()
		if (addDelay) {
			await randomWait()
		}
	}

	/**
	 * Update all authors
	 * Uses parallel processing when USE_PARALLEL_SCHEDULER feature flag is enabled
	 */
	async updateAuthors(): Promise<void> {
		const authors = await this.getAllAuthorAsins()
		this.logger.debug(NoticeUpdateScheduled('Authors'))
		this.logMemoryUsage('authors:start')

		const config = getPerformanceConfig()

		if (config.USE_PARALLEL_SCHEDULER) {
			// Parallel processing with concurrency control
			const perRegionLimit = Math.min(config.SCHEDULER_CONCURRENCY, MAX_PER_REGION_CONCURRENCY)
			const { summary } = await processBatchByRegion(
				authors,
				async (author) => {
					try {
						await this.processAuthor(author, false)
					} catch (error) {
						this.logger.error(error)
						throw error
					}
				},
				{ concurrency: config.SCHEDULER_CONCURRENCY, maxPerRegion: perRegionLimit }
			)
			this.logBatchSummary('Authors', summary, config.SCHEDULER_CONCURRENCY, perRegionLimit)
		} else {
			// Sequential processing (original behavior) - add delay between requests
			for (const author of authors) {
				try {
					await this.processAuthor(author, true)
				} catch (error) {
					this.logger.error(error)
				}
			}
		}
		this.logMemoryUsage('authors:complete')
	}

	/**
	 * Update all books
	 * Uses parallel processing when USE_PARALLEL_SCHEDULER feature flag is enabled
	 */
	async updateBooks(): Promise<void> {
		const books = await this.getAllBookAsins()
		this.logger.debug(NoticeUpdateScheduled('Books'))
		this.logMemoryUsage('books:start')

		const config = getPerformanceConfig()

		if (config.USE_PARALLEL_SCHEDULER) {
			// Parallel processing with concurrency control
			const perRegionLimit = Math.min(config.SCHEDULER_CONCURRENCY, MAX_PER_REGION_CONCURRENCY)
			const { summary } = await processBatchByRegion(
				books,
				async (book) => {
					try {
						await this.processBook(book, false)
					} catch (error) {
						this.logger.error(error)
						throw error
					}
				},
				{ concurrency: config.SCHEDULER_CONCURRENCY, maxPerRegion: perRegionLimit }
			)
			this.logBatchSummary('Books', summary, config.SCHEDULER_CONCURRENCY, perRegionLimit)
		} else {
			// Sequential processing (original behavior) - add delay between requests
			for (const book of books) {
				try {
					await this.processBook(book, true)
				} catch (error) {
					this.logger.error(error)
				}
			}
		}
		this.logMemoryUsage('books:complete')
	}

	/**
	 * Update all chapters
	 * Uses parallel processing when USE_PARALLEL_SCHEDULER feature flag is enabled
	 */
	async updateChapters(): Promise<void> {
		const chapters = await this.getAllChapterAsins()
		this.logger.debug(NoticeUpdateScheduled('Chapters'))
		this.logMemoryUsage('chapters:start')

		const config = getPerformanceConfig()

		if (config.USE_PARALLEL_SCHEDULER) {
			// Parallel processing with concurrency control
			const perRegionLimit = Math.min(config.SCHEDULER_CONCURRENCY, MAX_PER_REGION_CONCURRENCY)
			const { summary } = await processBatchByRegion(
				chapters,
				async (chapter) => {
					try {
						await this.processChapter(chapter, false)
					} catch (error) {
						this.logger.error(error)
						throw error
					}
				},
				{ concurrency: config.SCHEDULER_CONCURRENCY, maxPerRegion: perRegionLimit }
			)
			this.logBatchSummary('Chapters', summary, config.SCHEDULER_CONCURRENCY, perRegionLimit)
		} else {
			// Sequential processing (original behavior) - add delay between requests
			for (const chapter of chapters) {
				try {
					await this.processChapter(chapter, true)
				} catch (error) {
					this.logger.error(error)
				}
			}
		}
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
