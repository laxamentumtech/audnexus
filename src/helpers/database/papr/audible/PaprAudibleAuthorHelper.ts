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
import { foldName } from '#helpers/utils/foldName'
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
 * Picks the canonical row for an ASIN: oldest by `createdAt`, with ties
 * broken by `_id` (ObjectId encodes a timestamp + monotonic counter, so
 * this is deterministic for same-instant rows).
 */
const oldestRow = (rows: AuthorDocument[]): AuthorDocument =>
	rows.reduce((oldest, row) => {
		const createdAt = row.createdAt?.getTime() ?? 0
		const oldestCreatedAt = oldest.createdAt?.getTime() ?? 0
		if (createdAt < oldestCreatedAt) return row
		if (createdAt === oldestCreatedAt && String(row._id) < String(oldest._id)) return row
		return oldest
	})

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
	 * using authorData from the constructor.
	 *
	 * The durable insert is the source of truth: post-insert work (alias
	 * append, concurrent-create reconciliation, read-back projection,
	 * index notification) is failure-tolerant. On post-insert failure the
	 * create still resolves, `markDirty` still runs so the warm index
	 * refreshes, and the failure is logged without rethrowing. Only a
	 * failed insert (nothing persisted) rejects.
	 */
	async create(): Promise<PaprAuthorReturn> {
		const incomingName = this.authorData.name
		let inserted
		try {
			await this.resolveIdentity()
			inserted = await AuthorModel.insertOne(this.authorData)
		} catch (error) {
			const message = getErrorMessage(error)
			this.logger?.error(message)
			throw new Error(ErrorMessageCreate(this.asin, 'author'), { cause: error })
		}
		try {
			// Alias append only after the main write succeeded: a failed
			// insert leaves no alias behind (no leaked aliases on failure).
			await this.appendAliasIfFoldedDifferent(incomingName)
			// One bounded reconciliation pass for concurrent first-time
			// creates: if a same-ASIN row raced us in (or is older for any
			// other reason) and this row is not the oldest, record this
			// row's spelling on the canonical row's aliases.
			await this.reconcileConcurrentCreate(inserted)
			return {
				data: (await this.findOneWithProjection()).data,
				modified: true
			}
		} catch (error) {
			// The row is already persisted: the durable insert is the
			// source of truth, so a post-insert failure must not surface
			// as a failed create. Log and degrade (matching this module's
			// silent-degradation convention) rather than rethrow.
			this.logger?.error(
				`[PaprAudibleAuthorHelper] Post-insert work failed for author ${this.asin} (row already persisted): ${getErrorMessage(error)}`
			)
			let data: ApiAuthorProfile | null = null
			try {
				data = (await this.findOneWithProjection()).data
			} catch (readError) {
				this.logger?.error(
					`[PaprAudibleAuthorHelper] Read-back after post-insert failure failed for author ${this.asin}: ${getErrorMessage(readError)}`
				)
			}
			return { data, modified: true }
		} finally {
			// The insert (and any alias writes) changed this ASIN's rows;
			// the index refreshes only these ASINs, never a full reload.
			// Runs even when the post-insert work above failed, so the
			// warm index is never left stale.
			authorNameIndex.markDirty(this.asin)
		}
	}

	/**
	 * Resolves canonical identity before inserting a new author row.
	 *
	 * Canonical rule: first-seen wins — the `name` of the oldest row
	 * (lowest `createdAt`, ties broken by `_id` for determinism on
	 * same-instant rows) across ALL rows for the ASIN is the canonical
	 * name and is never clobbered.
	 *
	 * If the canonical row's name differs from the incoming name (folded
	 * comparison: trim, collapse whitespace, lowercase), the incoming name
	 * is recorded as an alias on the canonical row (see
	 * `appendAliasIfFoldedDifferent`) and the insert uses the canonical
	 * name. The alias append uses `$addToSet` so concurrent regional
	 * creates cannot clobber each other (exact-string dedup);
	 * folding-level dedup is applied at display time.
	 *
	 * Create-path only: updates preserve each regional row's own name
	 * (see `update`), so this must not run there.
	 *
	 * Mutates `this.authorData` in place; no-op when no prior row exists
	 * or the incoming name folds equal to the canonical name.
	 */
	private async resolveIdentity(): Promise<void> {
		const rows = ((await AuthorModel.find({ asin: this.asin })) ?? []).filter(isAuthorDocument)
		if (rows.length === 0) {
			return
		}
		const canonical = oldestRow(rows)
		if (foldName(canonical.name) === foldName(this.authorData.name)) {
			return
		}
		this.authorData = { ...this.authorData, name: canonical.name }
	}

	/**
	 * Appends `incomingName` to the canonical row's `aliases` when it is
	 * folded-different from the canonical row's name and not already
	 * present as an exact string. Runs only in the create path, immediately
	 * AFTER the main insert succeeds, so a failed insert leaves no alias
	 * behind (no leaked aliases on failure). Updates keep the regional
	 * row's own name and never alias.
	 *
	 * This write is post-insert work: per `create()`'s failure semantics it
	 * is failure-tolerant (the durable insert is the source of truth), and
	 * it marks the ASIN dirty on its own when the alias write lands.
	 */
	private async appendAliasIfFoldedDifferent(incomingName: string): Promise<void> {
		const rows = ((await AuthorModel.find({ asin: this.asin })) ?? []).filter(isAuthorDocument)
		if (rows.length === 0) {
			return
		}
		const canonical = oldestRow(rows)
		if (foldName(canonical.name) === foldName(incomingName)) {
			return
		}
		if (!canonical.aliases?.includes(incomingName)) {
			await AuthorModel.updateOne({ _id: canonical._id }, { $addToSet: { aliases: incomingName } })
			// The alias is in the DB; notify immediately — this write can
			// succeed even if the subsequent insert fails.
			authorNameIndex.markDirty(this.asin)
		}
	}

	/**
	 * Reconciles a concurrent first-time create. After our insert, re-read
	 * all rows for the ASIN: if this row is NOT the oldest, some row won
	 * the race — and if its canonical name is folded-different from ours,
	 * record our spelling on the canonical row's aliases atomically
	 * ($addToSet dedupes concurrent appends of the same spelling).
	 *
	 * The alias append before the insert covers the common path (rows
	 * already existed when we read identity); this pass covers the race
	 * where our read saw no rows and a same-ASIN row appeared before our
	 * insert landed. One bounded pass, no lock.
	 */
	private async reconcileConcurrentCreate(inserted: AuthorDocument): Promise<void> {
		const rows = ((await AuthorModel.find({ asin: this.asin })) ?? []).filter(isAuthorDocument)
		if (rows.length === 0) {
			return
		}
		const canonical = oldestRow(rows)
		// We are the oldest: our spelling is the canonical one now
		if (String(canonical._id) === String(inserted._id)) {
			return
		}
		if (foldName(canonical.name) === foldName(inserted.name)) {
			return
		}
		await AuthorModel.updateOne({ _id: canonical._id }, { $addToSet: { aliases: inserted.name } })
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
			authorNameIndex.markDirty(this.asin)
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
			// Normalize the name before comparing so a folded-different
			// spelling (stored canonical vs incoming variant) short-circuits
			// to no-op instead of running a full update + index invalidation.
			const normalized =
				foldName(this.authorData.name) === foldName(data.name)
					? { ...this.authorData, name: data.name }
					: this.authorData
			const isEqual = this.sharedHelper.isEqualData(data, normalized)
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
	 * Writes the incoming regional spelling into the row (the canonical-
	 * identity rewrite applies to new rows only, create path). The row's
	 * previous spelling is kept as an alias when it differs (folded
	 * comparison) and is not already aliased, so books crediting the old
	 * spelling keep resolving to this ASIN after the name changes.
	 */
	async update(): Promise<PaprAuthorReturn> {
		try {
			const found = await this.findOne()
			if (!found.data) {
				throw new Error(ErrorMessageNotFoundInDb(this.asin, 'Author'))
			}
			const previousName = found.data.name
			const previousAliases = found.data.aliases ?? []
			const aliasUpdate =
				foldName(previousName) !== foldName(this.authorData.name) &&
				!previousAliases.includes(previousName)
					? { $addToSet: { aliases: previousName } }
					: undefined
			await AuthorModel.updateOne(
				{ asin: this.asin, $or: [{ region: { $exists: false } }, { region: this.options.region }] },
				{
					$set: { ...this.authorData, createdAt: found.data._id.getTimestamp() },
					...(aliasUpdate ?? {}),
					$currentDate: { updatedAt: true }
				}
			)
			authorNameIndex.markDirty(this.asin)
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
