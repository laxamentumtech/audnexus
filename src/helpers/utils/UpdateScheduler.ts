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
import { processBatchByRegion } from '#helpers/utils/batchProcessor'
import { NoticeUpdateScheduled } from '#static/messages'

const waitFor = (ms: number) => new Promise((r) => setTimeout(r, ms))
// Wait for between 0 and 5 seconds
const randomWait = () => waitFor(Math.floor(Math.random() * 5000))

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
	private async processAuthor(author: DocumentWithRegion): Promise<void> {
		const helper = new AuthorShowHelper(
			author.asin,
			{ region: author.region ? author.region : 'us', update: '1' },
			this.redis
		)
		await helper.handler()
		await randomWait()
	}

	/**
	 * Process a single book update
	 */
	private async processBook(book: DocumentWithRegion): Promise<void> {
		const helper = new BookShowHelper(
			book.asin,
			{ region: book.region ? book.region : 'us', update: '1' },
			this.redis
		)
		await helper.handler()
		await randomWait()
	}

	/**
	 * Process a single chapter update
	 */
	private async processChapter(chapter: DocumentWithRegion): Promise<void> {
		const helper = new ChapterShowHelper(
			chapter.asin,
			{ region: chapter.region ? chapter.region : 'us', update: '1' },
			this.redis
		)
		await helper.handler()
		await randomWait()
	}

	/**
	 * Update all authors
	 * Uses parallel processing when USE_PARALLEL_SCHEDULER feature flag is enabled
	 */
	async updateAuthors(): Promise<void> {
		const authors = await this.getAllAuthorAsins()
		this.logger.debug(NoticeUpdateScheduled('Authors'))

		const config = getPerformanceConfig()

		if (config.USE_PARALLEL_SCHEDULER) {
			// Parallel processing with concurrency control
			await processBatchByRegion(
				authors,
				async (author) => {
					try {
						await this.processAuthor(author)
					} catch (error) {
						this.logger.error(error)
					}
				},
				{ concurrency: config.SCHEDULER_CONCURRENCY }
			)
		} else {
			// Sequential processing (original behavior)
			for (const author of authors) {
				try {
					await this.processAuthor(author)
				} catch (error) {
					this.logger.error(error)
				}
			}
		}
	}

	/**
	 * Update all books
	 * Uses parallel processing when USE_PARALLEL_SCHEDULER feature flag is enabled
	 */
	async updateBooks(): Promise<void> {
		const books = await this.getAllBookAsins()
		this.logger.debug(NoticeUpdateScheduled('Books'))

		const config = getPerformanceConfig()

		if (config.USE_PARALLEL_SCHEDULER) {
			// Parallel processing with concurrency control
			await processBatchByRegion(
				books,
				async (book) => {
					try {
						await this.processBook(book)
					} catch (error) {
						this.logger.error(error)
					}
				},
				{ concurrency: config.SCHEDULER_CONCURRENCY }
			)
		} else {
			// Sequential processing (original behavior)
			for (const book of books) {
				try {
					await this.processBook(book)
				} catch (error) {
					this.logger.error(error)
				}
			}
		}
	}

	/**
	 * Update all chapters
	 * Uses parallel processing when USE_PARALLEL_SCHEDULER feature flag is enabled
	 */
	async updateChapters(): Promise<void> {
		const chapters = await this.getAllChapterAsins()
		this.logger.debug(NoticeUpdateScheduled('Chapters'))

		const config = getPerformanceConfig()

		if (config.USE_PARALLEL_SCHEDULER) {
			// Parallel processing with concurrency control
			await processBatchByRegion(
				chapters,
				async (chapter) => {
					try {
						await this.processChapter(chapter)
					} catch (error) {
						this.logger.error(error)
					}
				},
				{ concurrency: config.SCHEDULER_CONCURRENCY }
			)
		} else {
			// Sequential processing (original behavior)
			for (const chapter of chapters) {
				try {
					await this.processChapter(chapter)
				} catch (error) {
					this.logger.error(error)
				}
			}
		}
	}

	/**
	 * Update all (authors, books, chapters)
	 * Sequential execution between categories
	 */
	async updateAll(): Promise<void> {
		await this.updateAuthors()
		await this.updateBooks()
		await this.updateChapters()
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
