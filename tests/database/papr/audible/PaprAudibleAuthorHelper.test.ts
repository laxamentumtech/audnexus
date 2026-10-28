import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { ObjectId } from 'mongodb'

import { createMockLogger } from '#tests/setup/mockLogger'

const mockUpdateOne = mock()
const mockFindOne = mock()
const mockInsertOne = mock()
const mockDeleteOne = mock()
const mockFind = mock()
const mockMarkDirty = mock()

mock.module('#config/models/Author', () => ({
	default: {
		updateOne: mockUpdateOne,
		findOne: mockFindOne,
		insertOne: mockInsertOne,
		deleteOne: mockDeleteOne,
		find: mockFind
	}
}))

mock.module('#helpers/authorNameIndex/AuthorNameIndex', () => ({
	authorNameIndex: {
		markDirty: mockMarkDirty
	}
}))

const mockIsEqualData = mock()

mock.module('#helpers/utils/shared', () => ({
	default: class SharedHelper {
		isEqualData = mockIsEqualData
	}
}))

import type { FastifyBaseLogger } from 'fastify'

import type { AuthorDocument } from '#config/models/Author'
import { ApiAuthorProfile, ApiQueryString } from '#config/types'
import * as checkers from '#config/typing/checkers'
import PaprAudibleAuthorHelper from '#helpers/database/papr/audible/PaprAudibleAuthorHelper'
import {
	authorWithoutGenresWithoutProjection,
	authorWithoutProjection,
	parsedAuthor,
	parsedAuthorWithoutGenres
} from '#tests/datasets/helpers/authors'

let asin: string
let helper: PaprAudibleAuthorHelper
let options: ApiQueryString

beforeEach(() => {
	mockUpdateOne.mockReset()
	mockFindOne.mockReset()
	mockInsertOne.mockReset()
	mockDeleteOne.mockReset()
	mockFind.mockReset()
	mockMarkDirty.mockReset()
	mockIsEqualData.mockReset()
	asin = parsedAuthor.asin
	options = {
		region: 'us',
		update: '1'
	}
	helper = new PaprAudibleAuthorHelper(asin, options)

	mockUpdateOne.mockResolvedValue({
		acknowledged: true,
		matchedCount: 1,
		modifiedCount: 1,
		upsertedCount: 0,
		upsertedId: authorWithoutProjection._id
	})
	mockFindOne.mockResolvedValue(authorWithoutProjection)
	// papr's insertOne resolves with the inserted document: echo the input
	// (with its _id) so reconcile sees the name that was actually inserted
	mockInsertOne.mockImplementation((doc: unknown) =>
		Promise.resolve({ ...(doc as object), _id: authorWithoutProjection._id })
	)
	spyOn(checkers, 'isAuthorDocument').mockReturnValue(true)
})

describe('PaprAudibleAuthorHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.options).toBe(options)
	})
	test('create', async () => {
		const obj = { data: parsedAuthor, modified: true }
		mockFindOne.mockResolvedValueOnce(parsedAuthor as unknown as AuthorDocument)
		helper.setData(parsedAuthor)

		await expect(helper.create()).resolves.toEqual(obj)
		expect(mockInsertOne).toHaveBeenCalledWith(parsedAuthor)
		expect(mockFindOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
		expect(mockMarkDirty).toHaveBeenCalledTimes(1)
	})
	test('create tolerates a post-insert failure: the durable insert wins, index is marked dirty', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleAuthorHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)
		helperWithLogger.setData(parsedAuthor)
		// resolveIdentity + alias append + reconciliation: the canonical
		// name differs, so the post-insert alias write runs and fails
		const canonicalId = new ObjectId('5c8f8f8f8f8f8f8f8f8f9f00')
		const canonicalRow: AuthorDocument = {
			_id: canonicalId,
			asin,
			name: 'Jason P. Anspach',
			region: 'us',
			aliases: [],
			createdAt: new Date('2019-01-01T00:00:00.000Z'),
			updatedAt: new Date('2019-01-01T00:00:00.000Z')
		}
		mockFind.mockResolvedValue([canonicalRow])
		mockUpdateOne.mockRejectedValue(new Error('db down'))
		mockFindOne.mockResolvedValue(parsedAuthor as unknown as AuthorDocument)

		// The row is already persisted: create resolves (no rethrow), the
		// index is marked dirty, and the failure is logged
		await expect(helperWithLogger.create()).resolves.toEqual({
			data: parsedAuthor,
			modified: true
		})
		expect(mockInsertOne).toHaveBeenCalledTimes(1)
		expect(mockMarkDirty).toHaveBeenCalledTimes(1)
		expect(mockLogger.error).toHaveBeenCalledTimes(1)
		expect(String(mockLogger.error.mock.calls[0]?.[0])).toContain(
			`Post-insert work failed for author ${asin}`
		)
	})
	test('create resolves with null data after post-insert and read-back failures', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleAuthorHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)
		helperWithLogger.setData(parsedAuthor)
		// resolveIdentity + alias append + reconciliation: the canonical
		// name differs, so the post-insert alias write runs and fails, and
		// the fallback projection read-back fails too
		const canonicalId = new ObjectId('5c8f8f8f8f8f8f8f8f8f9f00')
		const canonicalRow: AuthorDocument = {
			_id: canonicalId,
			asin,
			name: 'Jason P. Anspach',
			region: 'us',
			aliases: [],
			createdAt: new Date('2019-01-01T00:00:00.000Z'),
			updatedAt: new Date('2019-01-01T00:00:00.000Z')
		}
		mockFind.mockResolvedValue([canonicalRow])
		mockUpdateOne.mockRejectedValue(new Error('db down'))
		mockFindOne.mockRejectedValue(new Error('db down'))

		// The durable insert is the source of truth: no rethrow, null data,
		// the index is marked dirty, and both failures are logged
		await expect(helperWithLogger.create()).resolves.toEqual({ data: null, modified: true })
		expect(mockInsertOne).toHaveBeenCalledTimes(1)
		expect(mockMarkDirty).toHaveBeenCalledTimes(1)
		expect(mockLogger.error).toHaveBeenCalledTimes(2)
		expect(String(mockLogger.error.mock.calls[0]?.[0])).toContain(
			`Post-insert work failed for author ${asin}`
		)
		expect(String(mockLogger.error.mock.calls[1]?.[0])).toContain(
			`Read-back after post-insert failure failed for author ${asin}`
		)
	})
	test('delete', async () => {
		const obj = { data: { acknowledged: true, deletedCount: 1 }, modified: true }
		mockDeleteOne.mockResolvedValue(obj.data)
		await expect(helper.delete()).resolves.toEqual(obj)
		expect(mockDeleteOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
		expect(mockMarkDirty).toHaveBeenCalledTimes(1)
	})
	test('findByName', async () => {
		helper = new PaprAudibleAuthorHelper('', { name: 'test', region: 'us' })
		const obj = { data: [{ asin: asin, name: 'test' }], modified: false }
		mockFind.mockResolvedValue([{ asin: asin, name: 'test' }] as unknown as AuthorDocument[])
		await expect(helper.findByName()).resolves.toEqual(obj)
	})
	test('findOne', async () => {
		const obj = { data: authorWithoutProjection, modified: false }
		await expect(helper.findOne()).resolves.toEqual(obj)
		expect(mockFindOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOne returns null if it is not an AuthorDocument', async () => {
		const obj = { data: null, modified: false }
		mockFindOne.mockResolvedValueOnce(null)
		spyOn(checkers, 'isAuthorDocument').mockReturnValueOnce(false)
		await expect(helper.findOne()).resolves.toEqual(obj)
		expect(mockFindOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOneWithProjection', async () => {
		const obj = { data: parsedAuthor, modified: false }
		mockFindOne.mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		await expect(helper.findOneWithProjection()).resolves.toEqual(obj)
		expect(mockFindOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOneWithProjection returns null if it is not an AuthorProfile', async () => {
		const obj = { data: null, modified: false }
		mockFindOne.mockResolvedValueOnce(null)
		await expect(helper.findOneWithProjection()).resolves.toEqual(obj)
		expect(mockFindOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('setData', () => {
		const authorData = parsedAuthor
		helper.setData(authorData)
		expect(helper.authorData).toBe(authorData)
	})
	test('createOrUpdate finds one to update', async () => {
		const obj = { data: parsedAuthor, modified: true }
		mockFindOne
			.mockResolvedValueOnce(parsedAuthor as unknown as AuthorDocument)
			.mockResolvedValueOnce(authorWithoutProjection)
			.mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		helper.setData(parsedAuthor)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate finds identical update data', async () => {
		const obj = { data: parsedAuthor, modified: false }
		mockFindOne.mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		mockIsEqualData.mockReturnValue(true)
		helper.setData(parsedAuthor)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate short-circuits a folded-equal name without an update', async () => {
		// Stored name is the canonical spelling; incoming is a folded variant.
		// The name is normalized before the equality check, so the update
		// short-circuits instead of running a full update + invalidation.
		const obj = { data: parsedAuthor, modified: false }
		mockFindOne.mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		mockIsEqualData.mockReturnValue(true)
		helper.setData({ ...parsedAuthor, name: '  jason   anspach ' })
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
		// isEqualData ran against the stored (normalized) name
		expect(mockIsEqualData).toHaveBeenCalledTimes(1)
		expect(mockIsEqualData).toHaveBeenCalledWith(parsedAuthor, {
			...parsedAuthor,
			name: 'Jason Anspach'
		})
		expect(mockUpdateOne).not.toHaveBeenCalled()
		expect(mockMarkDirty).not.toHaveBeenCalled()
	})
	test('createOrUpdate needs to create', async () => {
		const obj = { data: parsedAuthor, modified: true }
		mockFindOne.mockResolvedValueOnce(null)
		mockFindOne.mockResolvedValue(authorWithoutProjection)
		helper.setData(parsedAuthor)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate difference in genres', async () => {
		const obj = { data: parsedAuthor, modified: true }
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(parsedAuthor as unknown as AuthorDocument)
			.mockResolvedValueOnce(authorWithoutProjection)
			.mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		helper.setData(parsedAuthor)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate genres on old, but not on new', async () => {
		const obj = { data: parsedAuthor, modified: false }
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(parsedAuthor as unknown as AuthorDocument)
			.mockResolvedValueOnce(authorWithoutProjection)
			.mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		helper.setData(parsedAuthorWithoutGenres)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate no genres on new or old', async () => {
		const obj = { data: parsedAuthorWithoutGenres, modified: false }
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(parsedAuthorWithoutGenres as unknown as AuthorDocument)
			.mockResolvedValueOnce(authorWithoutGenresWithoutProjection)
			.mockResolvedValue(parsedAuthorWithoutGenres as unknown as AuthorDocument)
		helper.setData(parsedAuthorWithoutGenres)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate logs info when updating', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleAuthorHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)
		mockIsEqualData.mockReturnValue(false)
		mockFindOne
			.mockResolvedValueOnce(parsedAuthor as unknown as AuthorDocument)
			.mockResolvedValueOnce(authorWithoutProjection)
			.mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		helperWithLogger.setData(parsedAuthor)
		await helperWithLogger.createOrUpdate()
		expect(mockLogger.info).toHaveBeenCalledWith(`Updating author ASIN ${asin}`)
	})
	test('update', async () => {
		const obj = { data: parsedAuthor, modified: true }
		helper.setData(parsedAuthor)
		mockFindOne.mockResolvedValueOnce(authorWithoutProjection)
		mockFindOne.mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		await expect(helper.update()).resolves.toEqual(obj)
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin: asin, $or: [{ region: { $exists: false } }, { region: options.region }] },
			{
				$set: { ...parsedAuthor, createdAt: authorWithoutProjection._id.getTimestamp() },
				$currentDate: { updatedAt: true }
			}
		)
		expect(mockMarkDirty).toHaveBeenCalledTimes(1)
	})
})

describe('PaprAudibleAuthorHelper should resolve canonical identity', () => {
	const usCanonicalId = new ObjectId('5c8f8f8f8f8f8f8f8f8f9f00')
	const usCanonical: AuthorDocument = {
		_id: usCanonicalId,
		asin,
		name: 'Jason P. Anspach',
		region: 'us',
		aliases: [],
		createdAt: new Date('2019-01-01T00:00:00.000Z'),
		updatedAt: new Date('2019-01-01T00:00:00.000Z')
	}
	const incoming = { ...parsedAuthor, region: 'ca' } as ApiAuthorProfile
	// create() reads all rows for the ASIN three times: resolveIdentity
	// (pre-insert), then alias append and concurrent-create reconciliation
	// (post-insert — the inserted row is visible to both).
	const mockRowSequence = (preRows: AuthorDocument[], insertedName: string) => {
		const postRows: AuthorDocument[] = [
			...preRows,
			{ ...authorWithoutProjection, name: insertedName, region: 'ca' }
		]
		mockFind.mockResolvedValueOnce(preRows)
		mockFind.mockResolvedValueOnce(postRows)
		mockFind.mockResolvedValueOnce(postRows)
	}

	test('inserts with canonical name and merges alias into us row when same-region row is absent', async () => {
		mockRowSequence([usCanonical], 'Jason P. Anspach')
		mockFindOne.mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		mockUpdateOne.mockResolvedValue({
			acknowledged: true,
			matchedCount: 1,
			modifiedCount: 1,
			upsertedCount: 0
		})
		helper = new PaprAudibleAuthorHelper(asin, { region: 'ca', update: undefined })
		helper.setData(incoming)

		await expect(helper.create()).resolves.toEqual({ data: parsedAuthor, modified: true })
		// Canonical name preserved, incoming name merged into aliases atomically
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ _id: usCanonicalId },
			{ $addToSet: { aliases: 'Jason Anspach' } }
		)
		expect(mockInsertOne).toHaveBeenCalledWith({ ...incoming, name: 'Jason P. Anspach' })
		// markDirty once for the alias write and once for the insert
		expect(mockMarkDirty).toHaveBeenCalledTimes(2)
	})

	test('does not rename or add alias when names match folded', async () => {
		mockRowSequence([usCanonical], '  jason   p. Anspach ')
		mockFindOne.mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		helper = new PaprAudibleAuthorHelper(asin, { region: 'ca', update: undefined })
		helper.setData({ ...incoming, name: '  jason   p. Anspach ' })

		await expect(helper.create()).resolves.toEqual({ data: parsedAuthor, modified: true })
		expect(mockUpdateOne).not.toHaveBeenCalled()
		// Insert keeps the incoming name since it folds equal to the canonical name
		expect(mockInsertOne).toHaveBeenCalledWith({ ...incoming, name: '  jason   p. Anspach ' })
		// No alias write, so only the insert marks dirty
		expect(mockMarkDirty).toHaveBeenCalledTimes(1)
	})

	test('does not add an alias that is already present as an exact string', async () => {
		mockRowSequence([{ ...usCanonical, aliases: ['Jason Anspach'] }], 'Jason P. Anspach')
		mockFindOne.mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		helper = new PaprAudibleAuthorHelper(asin, { region: 'ca', update: undefined })
		helper.setData(incoming)

		await expect(helper.create()).resolves.toEqual({ data: parsedAuthor, modified: true })
		expect(mockUpdateOne).not.toHaveBeenCalled()
		expect(mockInsertOne).toHaveBeenCalledWith({ ...incoming, name: 'Jason P. Anspach' })
	})

	test('picks the oldest row across all regions as canonical, not just same-region or us', async () => {
		// de row is oldest; us row is second; ca row is newest
		const deCanonicalId = new ObjectId('5c8f8f8f8f8f8f8f8f8f9f02')
		const deCanonical: AuthorDocument = {
			...usCanonical,
			_id: deCanonicalId,
			name: 'Jason Paul Anspach',
			region: 'de',
			createdAt: new Date('2018-01-01T00:00:00.000Z')
		}
		const caRow: AuthorDocument = {
			...usCanonical,
			name: 'Jason Anspach',
			region: 'ca',
			createdAt: new Date('2020-01-01T00:00:00.000Z')
		}
		mockRowSequence([caRow, usCanonical, deCanonical], 'Jason Paul Anspach')
		mockFindOne.mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		helper = new PaprAudibleAuthorHelper(asin, { region: 'ca', update: undefined })
		helper.setData(incoming)

		await expect(helper.create()).resolves.toEqual({ data: parsedAuthor, modified: true })
		// Oldest row wins even though a same-region row exists
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ _id: deCanonicalId },
			{ $addToSet: { aliases: 'Jason Anspach' } }
		)
		expect(mockInsertOne).toHaveBeenCalledWith({ ...incoming, name: 'Jason Paul Anspach' })
	})

	test('breaks createdAt ties by _id, not cursor order', async () => {
		// Same instant: the lower _id must win regardless of array order
		const rowAId = new ObjectId('5c8f8f8f8f8f8f8f8f8f9f01')
		const rowBId = new ObjectId('5c8f8f8f8f8f8f8f8f8f9f02')
		const rowA: AuthorDocument = {
			...usCanonical,
			_id: rowAId,
			name: 'Jason Alan Anspach',
			createdAt: new Date('2019-01-01T00:00:00.000Z')
		}
		const rowB: AuthorDocument = {
			...usCanonical,
			_id: rowBId,
			name: 'Jason A. Anspach',
			createdAt: new Date('2019-01-01T00:00:00.000Z')
		}
		// B first in cursor order; A has the lower _id and must be canonical
		mockRowSequence([rowB, rowA], 'Jason Alan Anspach')
		mockFindOne.mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		helper = new PaprAudibleAuthorHelper(asin, { region: 'ca', update: undefined })
		helper.setData(incoming)

		await expect(helper.create()).resolves.toEqual({ data: parsedAuthor, modified: true })
		expect(mockInsertOne).toHaveBeenCalledWith({ ...incoming, name: 'Jason Alan Anspach' })
		// Alias recorded on the _id-tie-break winner
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ _id: rowAId },
			{ $addToSet: { aliases: 'Jason Anspach' } }
		)
	})

	test('update() writes the incoming name and keeps the previous spelling as an alias', async () => {
		// Distinct canonical, existing regional, and incoming names: the
		// update writes the incoming spelling into the row (the canonical
		// rewrite is create-path only) and records the previous spelling
		// as an alias so the old spelling keeps resolving.
		const regionalUsRow: AuthorDocument = {
			...authorWithoutProjection,
			_id: usCanonicalId,
			name: 'Jason Anspach',
			region: 'us',
			aliases: [],
			createdAt: usCanonicalId.getTimestamp(),
			updatedAt: usCanonicalId.getTimestamp()
		}
		// findOne (region-scoped) → us row; post-update projection → it
		// (the projection drops _id/createdAt/updatedAt/aliases)
		const projectedRow = { ...parsedAuthor, name: regionalUsRow.name }
		mockFindOne
			.mockResolvedValueOnce(regionalUsRow)
			.mockResolvedValue(regionalUsRow as unknown as AuthorDocument)
		// incoming name is a third distinct spelling
		helper.setData({ ...parsedAuthor, name: 'Jason Alan Anspach' })

		await expect(helper.update()).resolves.toEqual({
			data: projectedRow,
			modified: true
		})
		// Single write: the row update carrying the incoming name, with
		// the previous spelling atomically added to aliases
		expect(mockUpdateOne).toHaveBeenCalledTimes(1)
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin, $or: [{ region: { $exists: false } }, { region: 'us' }] },
			expect.objectContaining({
				$set: expect.objectContaining({
					name: 'Jason Alan Anspach',
					createdAt: regionalUsRow._id.getTimestamp()
				}),
				$addToSet: { aliases: 'Jason Anspach' }
			})
		)
		// No identity read, index marked dirty once
		expect(mockFind).not.toHaveBeenCalled()
		expect(mockMarkDirty).toHaveBeenCalledTimes(1)
	})

	test('update() adds the previous spelling as an alias for a legacy row without an aliases field', async () => {
		// Legacy row: the aliases field is entirely absent (predates the
		// schema default) — update must not throw and must record the
		// previous spelling as an alias.
		const legacyUsRow = {
			...authorWithoutProjection,
			_id: usCanonicalId,
			name: 'Jason Anspach',
			region: 'us',
			createdAt: usCanonicalId.getTimestamp(),
			updatedAt: usCanonicalId.getTimestamp()
		} as unknown as AuthorDocument
		mockFindOne
			.mockResolvedValueOnce(legacyUsRow)
			.mockResolvedValue(legacyUsRow)
		helper.setData({ ...parsedAuthor, name: 'Jason Alan Anspach' })

		await expect(helper.update()).resolves.toMatchObject({ modified: true })
		expect(mockUpdateOne).toHaveBeenCalledTimes(1)
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin, $or: [{ region: { $exists: false } }, { region: 'us' }] },
			expect.objectContaining({
				$set: expect.objectContaining({ name: 'Jason Alan Anspach' }),
				$addToSet: { aliases: 'Jason Anspach' }
			})
		)
		expect(mockMarkDirty).toHaveBeenCalledTimes(1)
	})

	test('update() adds no alias when the incoming name folds equal to the stored one', async () => {
		const regionalUsRow: AuthorDocument = {
			...authorWithoutProjection,
			_id: usCanonicalId,
			name: 'Jason Anspach',
			region: 'us',
			aliases: [],
			createdAt: usCanonicalId.getTimestamp(),
			updatedAt: usCanonicalId.getTimestamp()
		}
		mockFindOne
			.mockResolvedValueOnce(regionalUsRow)
			.mockResolvedValue(regionalUsRow as unknown as AuthorDocument)
		helper.setData({ ...parsedAuthor, name: '  jason   Anspach ' })

		await expect(helper.update()).resolves.toEqual({ data: parsedAuthor, modified: true })
		expect(mockUpdateOne).toHaveBeenCalledTimes(1)
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin, $or: [{ region: { $exists: false } }, { region: 'us' }] },
			expect.not.objectContaining({ $addToSet: expect.anything() })
		)
	})

	test('update() adds no alias when the previous spelling is already aliased', async () => {
		const regionalUsRow: AuthorDocument = {
			...authorWithoutProjection,
			_id: usCanonicalId,
			name: 'Jason Anspach',
			region: 'us',
			aliases: ['Jason Anspach'],
			createdAt: usCanonicalId.getTimestamp(),
			updatedAt: usCanonicalId.getTimestamp()
		}
		mockFindOne
			.mockResolvedValueOnce(regionalUsRow)
			.mockResolvedValue(regionalUsRow as unknown as AuthorDocument)
		helper.setData({ ...parsedAuthor, name: 'Jason Alan Anspach' })

		await expect(helper.update()).resolves.toEqual({ data: parsedAuthor, modified: true })
		expect(mockUpdateOne).toHaveBeenCalledTimes(1)
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin, $or: [{ region: { $exists: false } }, { region: 'us' }] },
			expect.not.objectContaining({ $addToSet: expect.anything() })
		)
	})

	test('create() leaves no alias when the insert fails', async () => {
		mockFind.mockResolvedValueOnce([usCanonical])
		helper = new PaprAudibleAuthorHelper(asin, { region: 'ca', update: undefined })
		helper.setData(incoming)
		mockInsertOne.mockRejectedValue(new Error('db down'))

		await expect(helper.create()).rejects.toThrow(
			`An error occurred while creating author ${asin} in the DB`
		)
		// Alias append runs only after the insert succeeds
		expect(mockUpdateOne).not.toHaveBeenCalled()
		expect(mockMarkDirty).not.toHaveBeenCalled()
	})

	test('reconciles a concurrent first-time create by aliasing the overlapping spelling', async () => {
		// Two creates race: this one saw no rows, but by the time it
		// reconciles a same-ASIN row from the other create exists and is
		// older, with a folded-different name.
		const racedRowId = new ObjectId('5c8f8f8f8f8f8f8f8f8f9f03')
		const racedRow: AuthorDocument = {
			...usCanonical,
			_id: racedRowId,
			name: 'Jason Paul Anspach',
			region: 'us',
			createdAt: new Date('2018-01-01T00:00:00.000Z')
		}
		const ownRow: AuthorDocument = {
			...usCanonical,
			_id: authorWithoutProjection._id,
			name: 'Jason Anspach',
			region: 'ca',
			createdAt: new Date('2020-01-01T00:00:00.000Z')
		}
		// resolveIdentity + alias append see no rows; reconciliation sees
		// the raced row alongside this one
		mockFind.mockResolvedValueOnce([])
		mockFind.mockResolvedValueOnce([])
		mockFind.mockResolvedValueOnce([racedRow, ownRow])
		mockFindOne.mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		helper = new PaprAudibleAuthorHelper(asin, { region: 'ca', update: undefined })
		helper.setData(incoming)

		await expect(helper.create()).resolves.toEqual({ data: parsedAuthor, modified: true })
		// This row is not the oldest: its spelling is recorded on the
		// canonical row's aliases atomically
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ _id: racedRowId },
			{ $addToSet: { aliases: 'Jason Anspach' } }
		)
		// One bounded reconciliation pass, then the final markDirty only
		expect(mockMarkDirty).toHaveBeenCalledTimes(1)
	})
})

describe('PaprAudibleAuthorHelper should catch error when', () => {
	test('create', async () => {
		mockInsertOne.mockRejectedValue(new Error('error'))
		helper.setData(parsedAuthor)
		await expect(helper.create()).rejects.toThrow(
			`An error occurred while creating author ${asin} in the DB`
		)
		expect(mockMarkDirty).not.toHaveBeenCalled()
	})
	test('create logs error on failure', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleAuthorHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)
		mockInsertOne.mockRejectedValue(new Error('DB error'))
		helperWithLogger.setData(parsedAuthor)
		await expect(helperWithLogger.create()).rejects.toThrow()
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})
	test('delete', async () => {
		mockDeleteOne.mockRejectedValue(new Error('error'))
		await expect(helper.delete()).rejects.toThrow(
			`An error occurred while deleting author ${asin} in the DB`
		)
	})
	test('delete logs error on failure', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleAuthorHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)
		mockDeleteOne.mockRejectedValue(new Error('DB error'))
		await expect(helperWithLogger.delete()).rejects.toThrow()
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})
	test('findByName has no name', async () => {
		await expect(helper.findByName()).rejects.toThrow('Invalid search parameters')
	})
	test('update did not find existing', async () => {
		mockFindOne.mockResolvedValueOnce(null)
		helper.setData(parsedAuthor)
		await expect(helper.update()).rejects.toThrow(
			`An error occurred while updating author ${asin} in the DB`
		)
	})
	test('update', async () => {
		mockUpdateOne.mockRejectedValue(new Error('error'))
		helper.setData(parsedAuthor)
		await expect(helper.update()).rejects.toThrow(
			`An error occurred while updating author ${asin} in the DB`
		)
	})
	test('update logs error on failure', async () => {
		const mockLogger = createMockLogger()
		const helperWithLogger = new PaprAudibleAuthorHelper(
			asin,
			options,
			mockLogger as unknown as FastifyBaseLogger
		)
		mockFindOne.mockResolvedValueOnce(authorWithoutProjection)
		mockUpdateOne.mockRejectedValue(new Error('DB error'))
		helperWithLogger.setData(parsedAuthor)
		await expect(helperWithLogger.update()).rejects.toThrow()
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})
})

afterAll(() => {
	mock.restore()
})
