import ChapterModel, { ChapterDocument } from '#config/models/Chapter'
import { ApiChapter } from '#config/typing/books'
import { isChapter, isChapterDocument } from '#config/typing/checkers'
import { PaprChapterDocumentReturn, PaprChapterReturn, PaprDeleteReturn } from '#config/typing/papr'
import { RequestGeneric } from '#config/typing/requests'
import getErrorMessage from '#helpers/utils/getErrorMessage'
import SharedHelper from '#helpers/utils/shared'
import {
	ErrorMessageCreate,
	ErrorMessageDelete,
	ErrorMessageNotFoundInDb,
	ErrorMessageUpdate,
	NoticeUpdateAsin
} from '#static/messages'

const projectionWithoutDbFields = {
	_id: 0,
	createdAt: 0,
	updatedAt: 0
}

export default class PaprAudibleChapterHelper {
	asin: string
	chapterData!: ApiChapter
	options: RequestGeneric['Querystring']

	constructor(asin: string, options: RequestGeneric['Querystring']) {
		this.asin = asin
		this.options = options
	}

	/**
	 * Inserts a new chapter into the DB
	 * using chapterData from the constructor
	 */
	async create(): Promise<PaprChapterReturn> {
		try {
			await ChapterModel.insertOne(this.chapterData)
			return {
				data: (await this.findOneWithProjection()).data,
				modified: true
			}
		} catch (error) {
			const message = getErrorMessage(error)
			console.error(message)
			throw new Error(ErrorMessageCreate(this.asin, 'chapter'))
		}
	}

	/**
	 * Deletes a chapter from the DB
	 * using asin from the constructor
	 */
	async delete(): Promise<PaprDeleteReturn> {
		try {
			const deletedChapter = await ChapterModel.deleteOne({ asin: this.asin })
			return {
				data: deletedChapter,
				modified: true
			}
		} catch (error) {
			const message = getErrorMessage(error)
			console.error(message)
			throw new Error(ErrorMessageDelete(this.asin, 'chapter'))
		}
	}

	/**
	 * Finds a chapter in the DB
	 * using asin from the constructor.
	 * Returns unaltered Document.
	 */
	async findOne(): Promise<PaprChapterDocumentReturn> {
		const findOneChapter = await ChapterModel.findOne({
			asin: this.asin
		})

		// Assign type to chapter data
		const data: ChapterDocument | null = isChapterDocument(findOneChapter) ? findOneChapter : null

		return {
			data: data,
			modified: false
		}
	}

	/**
	 * Finds a chapter in the DB
	 * using asin from the constructor.
	 * Returns altered Document using projection.
	 */
	async findOneWithProjection(): Promise<PaprChapterReturn> {
		const findOneChapter = await ChapterModel.findOne(
			{
				asin: this.asin
			},
			{ projection: projectionWithoutDbFields }
		)

		// Assign type to chapter data
		const data: ApiChapter | null = isChapter(findOneChapter) ? findOneChapter : null

		return {
			data: data,
			modified: false
		}
	}

	/**
	 * Set chapterData in the class object
	 */
	setChapterData(chapterData: ApiChapter) {
		this.chapterData = chapterData
	}

	/**
	 * Creates a chapter if it doesn't exist.
	 *
	 * Updates a existing chapter if:
	 *
	 * 1. `options.update` is 1 and the chapter exists
	 * 2. The incoming data is different from the existing data
	 * 3. The new chapters have a valid length
	 */
	async createOrUpdate(): Promise<PaprChapterReturn> {
		const sharedHelper = new SharedHelper()
		const findInDb = await this.findOneWithProjection()

		// Update
		if (this.options.update === '1' && findInDb.data) {
			const data = findInDb.data
			// If the objects are the exact same return right away
			const equality = sharedHelper.checkDataEquality(data, this.chapterData)
			if (equality) {
				return {
					data: data,
					modified: false
				}
			}
			if (this.chapterData.chapters.length) {
				console.log(NoticeUpdateAsin(this.asin, 'chapters'))
				// Update
				return this.update()
			}
			// No update performed, return original
			return findInDb
		}

		// Create
		return this.create()
	}

	/**
	 * Updates a chapter in the DB
	 * using asin from the constructor.
	 * Always sets createdAt and updatedAt fields.
	 * Returns altered Document using findOneWithProjection.
	 */
	async update(): Promise<PaprChapterReturn> {
		try {
			const found = await this.findOne()
			if (!found.data) {
				throw new Error(ErrorMessageNotFoundInDb(this.asin, 'Chapter'))
			}
			await ChapterModel.updateOne(
				{ asin: this.asin },
				{
					$set: { ...this.chapterData, createdAt: found.data._id.getTimestamp() },
					$currentDate: { updatedAt: true }
				}
			)
			// After updating, return with specific projection
			const updatedChapter = await this.findOneWithProjection()
			// Set modified to true to indicate that the data has been updated
			updatedChapter.modified = true
			return updatedChapter
		} catch (error) {
			const message = getErrorMessage(error)
			console.error(message)
			throw new Error(ErrorMessageUpdate(this.asin, 'chapter'))
		}
	}
}
