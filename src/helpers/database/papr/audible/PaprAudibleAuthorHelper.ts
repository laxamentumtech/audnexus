import type { FastifyBaseLogger } from 'fastify'

import AuthorModel, { AuthorDocument } from '#config/models/Author'
import { ApiAuthorProfile, ApiAuthorProfileSchema, ApiQueryString } from '#config/types'
import { isAuthorDocument } from '#config/typing/checkers'
import {
	PaprAuthorDocumentReturn,
	PaprAuthorReturn,
	PaprAuthorSearch,
	PaprDeleteReturn
} from '#config/typing/papr'
import { authorNameIndex } from '#helpers/authorNameIndex/AuthorNameIndex'
import getErrorMessage from '#helpers/utils/getErrorMessage'
import SharedHelper from '#helpers/utils/shared'
import {
	ErrorMessageCreate,
	ErrorMessageDelete,
	ErrorMessageNotFoundInDb,
	ErrorMessageUpdate,
	MessageNoSearchParams,
	NoticeUpdateAsin
} from '#static/messages'

/**
 * Folds a name for identity comparison: trim, collapse whitespace, lowercase.
 */
const foldName = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase()

export default class PaprAudibleAuthorHelper {
	asin: string
	authorData!: ApiAuthorProfile
	options: ApiQueryString
	sharedHelper = new SharedHelper()
	logger?: FastifyBaseLogger

	constructor(asin: string, options: ApiQueryString, logger?: FastifyBaseLogger) {
		this.asin = asin
		this.options = options
		this.logger = logger
	}

	/**
	 * Inserts a new author into the DB
	 * using authorData from the constructor
	 */
	async create(): Promise<PaprAuthorReturn> {
		try {
			await this.resolveIdentity()
			await AuthorModel.insertOne(this.authorData)
			authorNameIndex.invalidate()
			return {
				data: (await this.findOneWithProjection()).data,
				modified: true
			}
		} catch (error) {
			const message = getErrorMessage(error)
			this.logger?.error(message)
			throw new Error(ErrorMessageCreate(this.asin, 'author'), { cause: error })
		}
	}

	/**
	 * Resolves canonical identity before writing an author row.
	 *
	 * Canonical rule: first-seen wins — the `name` of the oldest row
	 * (lowest `createdAt`) across ALL rows for the ASIN is the canonical name
	 * and is never clobbered.
	 *
	 * If the canonical row's name differs from the incoming name (folded
	 * comparison: trim, collapse whitespace, lowercase), the incoming name is
	 * appended to the canonical row's `aliases` and the write uses the
	 * canonical name. The append uses `$addToSet` so concurrent regional
	 * creates cannot clobber each other (exact-string dedup); folding-level
	 * dedup is applied at display time.
	 *
	 * Mutates `this.authorData` in place; no-op when no prior row exists.
	 */
	private async resolveIdentity(): Promise<void> {
		const rows = ((await AuthorModel.find({ asin: this.asin })) ?? []).filter(isAuthorDocument)
		if (rows.length === 0) {
			return
		}
		const canonical = rows.reduce((oldest, row) =>
			(row.createdAt?.getTime() ?? 0) < (oldest.createdAt?.getTime() ?? 0) ? row : oldest
		)
		const canonicalName = canonical.name
		const incoming = this.authorData.name
		if (foldName(canonicalName) === foldName(incoming)) {
			return
		}
		if (!canonical.aliases?.includes(incoming)) {
			await AuthorModel.updateOne({ _id: canonical._id }, { $addToSet: { aliases: incoming } })
			// The alias is now in the DB; an already-built index would miss it.
			authorNameIndex.invalidate()
		}
		this.authorData = { ...this.authorData, name: canonicalName }
	}

	/**
	 * Deletes an author from the DB
	 * using asin from the constructor
	 */
	async delete(): Promise<PaprDeleteReturn> {
		try {
			const deletedAuthor = await AuthorModel.deleteOne({
				asin: this.asin,
				$or: [{ region: { $exists: false } }, { region: this.options.region }]
			})
			authorNameIndex.invalidate()
			return {
				data: deletedAuthor,
				modified: true
			}
		} catch (error) {
			const message = getErrorMessage(error)
			this.logger?.error(message)
			throw new Error(ErrorMessageDelete(this.asin, 'author'), { cause: error })
		}
	}

	/**
	 * Searches for authors in the DB using options.name
	 * Returns altered Documents using projection.
	 */
	async findByName(): Promise<PaprAuthorSearch> {
		if (!this.options.name) {
			throw new Error(MessageNoSearchParams)
		}
		// Use projection search from mongo until papr implements it natively.
		// https://github.com/plexinc/papr/issues/98
		const found = await AuthorModel.find(
			{ $text: { $search: this.options.name } },
			{
				projection: { _id: 0, asin: 1, name: 1 },
				limit: 25,
				sort: { score: { $meta: 'textScore' } }
			}
		)

		return {
			data: found,
			modified: false
		}
	}

	/**
	 * Finds an author in the DB
	 * using asin from the constructor.
	 * Returns unaltered Document.
	 */
	async findOne(): Promise<PaprAuthorDocumentReturn> {
		const findOneAuthor = await AuthorModel.findOne({
			asin: this.asin,
			$or: [{ region: { $exists: false } }, { region: this.options.region }]
		})

		// Assign type to author data
		const data: AuthorDocument | null = isAuthorDocument(findOneAuthor) ? findOneAuthor : null

		return {
			data: data,
			modified: false
		}
	}

	/**
	 * Finds an author in the DB
	 * using asin from the constructor.
	 * Returns altered Document using projection.
	 */
	async findOneWithProjection(): Promise<PaprAuthorReturn> {
		const findOneAuthor = await AuthorModel.findOne({
			asin: this.asin,
			$or: [{ region: { $exists: false } }, { region: this.options.region }]
		})

		// Parse data to ensure it's the correct type and remove any extra fields
		const dataParsed = ApiAuthorProfileSchema.safeParse(findOneAuthor)
		// Assign data to variable if it's valid, otherwise assign null
		const data = dataParsed.success ? dataParsed.data : null

		return {
			data: data,
			modified: false
		}
	}

	/**
	 * Set authorData in the class object
	 */
	setData(authorData: ApiAuthorProfile) {
		this.authorData = authorData
	}

	/**
	 * Creates an author if it doesn't exist.
	 *
	 * Updates an existing author if:
	 *
	 * 1. `options.update` is 1 and the author exists
	 * 2. The incoming data is different from the existing data
	 * 3. Genres exist or are different
	 */
	async createOrUpdate(): Promise<PaprAuthorReturn> {
		const findInDb = await this.findOneWithProjection()

		// Update
		if (this.options.update === '1' && findInDb.data) {
			const data = findInDb.data
			// If the objects are the exact same return right away
			const isEqual = this.sharedHelper.isEqualData(data, this.authorData)
			if (isEqual) {
				return {
					data: data,
					modified: false
				}
			}
			// Check state of existing author
			// Only update if either genres exist and can be checked
			// -or if genres exist on new item but not old
			if (data.genres || (!data.genres && this.authorData.genres)) {
				// Only update if it's not nuked data
				if (this.authorData.genres?.length) {
					this.logger?.info(NoticeUpdateAsin(this.asin, 'author'))
					// Update
					return this.update()
				}
			}
			// No update performed, return original
			return findInDb
		}

		// Create
		return this.create()
	}

	/**
	 * Updates an author in the DB
	 * using asin from the constructor.
	 * Always sets createdAt and updatedAt fields.
	 * Returns altered Document using findOneWithProjection.
	 *
	 * Applies the same canonical-identity rules as create (via
	 * `resolveIdentity`): an incoming spelling that folds-different from the
	 * canonical row's name is recorded as an alias, never written as the
	 * row's `name`.
	 */
	async update(): Promise<PaprAuthorReturn> {
		try {
			const found = await this.findOne()
			if (!found.data) {
				throw new Error(ErrorMessageNotFoundInDb(this.asin, 'Author'))
			}
			await this.resolveIdentity()
			await AuthorModel.updateOne(
				{ asin: this.asin, $or: [{ region: { $exists: false } }, { region: this.options.region }] },
				{
					$set: { ...this.authorData, createdAt: found.data._id.getTimestamp() },
					$currentDate: { updatedAt: true }
				}
			)
			// After updating, return with specific projection
			authorNameIndex.invalidate()
			const updatedAuthor = await this.findOneWithProjection()
			// Set modified to true to indicate that the data has been updated
			updatedAuthor.modified = true
			return updatedAuthor
		} catch (error) {
			const message = getErrorMessage(error)
			this.logger?.error(message)
			throw new Error(ErrorMessageUpdate(this.asin, 'author'), { cause: error })
		}
	}
}
