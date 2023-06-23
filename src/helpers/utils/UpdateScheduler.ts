import { FastifyRedis } from '@fastify/redis'
import { AsyncTask, SimpleIntervalJob } from 'toad-scheduler'

import AuthorModel from '#config/models/Author'
import BookModel from '#config/models/Book'
import ChapterModel from '#config/models/Chapter'
import AuthorShowHelper from '#helpers/routes/AuthorShowHelper'
import BookShowHelper from '#helpers/routes/BookShowHelper'
import ChapterShowHelper from '#helpers/routes/ChapterShowHelper'

type ProjectionType = {
	asin: string
	region: string
}

const waitFor = (ms: number) => new Promise((r) => setTimeout(r, ms))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asyncForEach = async (array: ProjectionType[], callback: any) => {
	for (let index = 0; index < array.length; index++) {
		await callback(array[index], index, array)
	}
}

class UpdateScheduler {
	interval: number
	redis: FastifyRedis
	constructor(interval: number, redis: FastifyRedis) {
		this.interval = interval
		this.redis = redis
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

	updateBooksTask() {
		return new AsyncTask(
			'updateBooks',
			async () => {
				console.log('Updating books')
				return this.getAllBookAsins().then((books) => {
					asyncForEach(books, async (book: ProjectionType) => {
						try {
							const helper = new BookShowHelper(
								book.asin,
								{ region: book.region ? book.region : 'us', update: '1' },
								this.redis
							)
							await helper.handler()
							await waitFor(1000)
						} catch (error) {
							console.error(error)
						}
					})
				})
			},
			(err) => {
				console.error(err)
			}
		)
	}

	updateAuthorsTask() {
		return new AsyncTask(
			'updateAuthors',
			async () => {
				console.log('Updating authors')
				this.getAllAuthorAsins().then((authors) => {
					asyncForEach(authors, async (author: ProjectionType) => {
						try {
							console.log('Updating author: ' + author.asin)
							const helper = new AuthorShowHelper(
								author.asin,
								{ region: author.region ? author.region : 'us', update: '1' },
								this.redis
							)
							await helper.handler()
							await waitFor(1000)
						} catch (error) {
							console.error(error)
						}
					})
				})
			},
			(err) => {
				console.error(err)
			}
		)
	}

	updateChaptersTask() {
		return new AsyncTask(
			'updateChapters',
			async () => {
				console.log('Updating chapters')
				this.getAllChapterAsins().then((chapters) => {
					asyncForEach(chapters, async (chapter: ProjectionType) => {
						try {
							const helper = new ChapterShowHelper(
								chapter.asin,
								{ region: chapter.region ? chapter.region : 'us', update: '1' },
								this.redis
							)
							await helper.handler()
							await waitFor(1000)
						} catch (error) {
							console.error(error)
						}
					})
				})
			},
			(err) => {
				console.error(err)
			}
		)
	}

	updateAuthorsJob() {
		return new SimpleIntervalJob({ days: this.interval }, this.updateAuthorsTask(), {
			id: 'id_1',
			preventOverrun: true
		})
	}

	updateBooksJob() {
		return new SimpleIntervalJob({ days: this.interval }, this.updateBooksTask(), {
			id: 'id_2',
			preventOverrun: true
		})
	}

	updateChaptersJob() {
		return new SimpleIntervalJob({ days: this.interval }, this.updateChaptersTask(), {
			id: 'id_3',
			preventOverrun: true
		})
	}
}

export default UpdateScheduler
