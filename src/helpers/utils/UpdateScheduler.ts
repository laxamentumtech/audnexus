import { FastifyRedis } from '@fastify/redis'
import { FastifyBaseLogger } from 'fastify'
import { AsyncTask, LongIntervalJob } from 'toad-scheduler'

import AuthorModel from '#config/models/Author'
import BookModel from '#config/models/Book'
import ChapterModel from '#config/models/Chapter'
import AuthorShowHelper from '#helpers/routes/AuthorShowHelper'
import BookShowHelper from '#helpers/routes/BookShowHelper'
import ChapterShowHelper from '#helpers/routes/ChapterShowHelper'
import { NoticeUpdateScheduled } from '#static/messages'

const waitFor = (ms: number) => new Promise((r) => setTimeout(r, ms))
// Wait for between 0 and 5 seconds
const randomWait = () => waitFor(Math.floor(Math.random() * 5000))

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

	updateAuthors() {
		return this.getAllAuthorAsins().then(async (authors) => {
			this.logger.debug(NoticeUpdateScheduled('Authors'))
			for await (const author of authors) {
				try {
					const helper = new AuthorShowHelper(
						author.asin,
						{ region: author.region ? author.region : 'us', update: '1' },
						this.redis
					)
					await helper.handler()
					await randomWait()
				} catch (error) {
					this.logger.error(error)
				}
			}
		})
	}

	updateBooks() {
		return this.getAllBookAsins().then(async (books) => {
			this.logger.debug(NoticeUpdateScheduled('Books'))
			for await (const book of books) {
				try {
					const helper = new BookShowHelper(
						book.asin,
						{ region: book.region ? book.region : 'us', update: '1' },
						this.redis
					)
					await helper.handler()
					await randomWait()
				} catch (error) {
					this.logger.error(error)
				}
			}
		})
	}

	updateChapters() {
		return this.getAllChapterAsins().then(async (chapters) => {
			this.logger.debug(NoticeUpdateScheduled('Chapters'))
			for await (const chapter of chapters) {
				try {
					const helper = new ChapterShowHelper(
						chapter.asin,
						{ region: chapter.region ? chapter.region : 'us', update: '1' },
						this.redis
					)
					await helper.handler()
					await randomWait()
				} catch (error) {
					this.logger.error(error)
				}
			}
		})
	}

	updateAll() {
		return this.updateAuthors().then(() => {
			this.updateBooks().then(() => {
				this.updateChapters()
			})
		})
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
