import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { ObjectId } from 'mongodb'

import { createMockLogger } from '#tests/setup/mockLogger'

const mockUpdateOne = mock()
const mockFindOne = mock()
const mockInsertOne = mock()
const mockDeleteOne = mock()
const mockFind = mock()
const mockInvalidate = mock()

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
		invalidate: mockInvalidate
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
	mockInvalidate.mockReset()
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
	mockInsertOne.mockResolvedValue(authorWithoutProjection)
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
		expect(mockInvalidate).toHaveBeenCalledTimes(1)
	})
	test('delete', async () => {
		const obj = { data: { acknowledged: true, deletedCount: 1 }, modified: true }
		mockDeleteOne.mockResolvedValue(obj.data)
		await expect(helper.delete()).resolves.toEqual(obj)
		expect(mockDeleteOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
		expect(mockInvalidate).toHaveBeenCalledTimes(1)
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
		expect(mockInvalidate).toHaveBeenCalledTimes(1)
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

	test('inserts with canonical name and merges alias into us row when same-region row is absent', async () => {
		// resolveIdentity: find all rows for the ASIN (us row only).
		// create() post-insert findOneWithProjection: parsedAuthor.
		mockFind.mockResolvedValueOnce([usCanonical])
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
		// Invalidated once for the alias write and once for the insert
		expect(mockInvalidate).toHaveBeenCalledTimes(2)
	})

	test('does not rename or add alias when names match folded', async () => {
		mockFind.mockResolvedValueOnce([usCanonical])
		mockFindOne.mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		helper = new PaprAudibleAuthorHelper(asin, { region: 'ca', update: undefined })
		helper.setData({ ...incoming, name: '  jason   p. Anspach ' })

		await expect(helper.create()).resolves.toEqual({ data: parsedAuthor, modified: true })
		expect(mockUpdateOne).not.toHaveBeenCalled()
		// Insert keeps the incoming name since it folds equal to the canonical name
		expect(mockInsertOne).toHaveBeenCalledWith({ ...incoming, name: '  jason   p. Anspach ' })
		// No alias write, so only the insert invalidates
		expect(mockInvalidate).toHaveBeenCalledTimes(1)
	})

	test('does not add an alias that is already present as an exact string', async () => {
		mockFind.mockResolvedValueOnce([{ ...usCanonical, aliases: ['Jason Anspach'] }])
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
		mockFind.mockResolvedValueOnce([caRow, usCanonical, deCanonical])
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

	test('update() records folded-different incoming name as alias and keeps canonical name', async () => {
		// update(): findOne (region-scoped) finds the us row; resolveIdentity find
		// returns the us row; post-update findOneWithProjection returns it with the
		// canonical name (aliases are display-time concerns, so the projection
		// echoes the row as the DB would hold it after the atomic $addToSet).
		mockFindOne
			.mockResolvedValueOnce(usCanonical)
			.mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		mockFind.mockResolvedValueOnce([usCanonical])
		// incoming 'Jason Anspach' folds-different from canonical 'Jason P. Anspach'
		helper.setData({ ...parsedAuthor })

		await expect(helper.update()).resolves.toEqual({ data: parsedAuthor, modified: true })
		// Alias appended atomically to the canonical row
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ _id: usCanonicalId },
			{ $addToSet: { aliases: 'Jason Anspach' } }
		)
		// Row update carries the canonical name, not the incoming spelling
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin, $or: [{ region: { $exists: false } }, { region: 'us' }] },
			expect.objectContaining({
				$set: expect.objectContaining({
					name: 'Jason P. Anspach',
					createdAt: usCanonical._id.getTimestamp()
				})
			})
		)
		// find is scoped to the ASIN only — all regions considered
		expect(mockFind).toHaveBeenCalledWith({ asin })
		// Invalidated once for the alias write and once for the row update
		expect(mockInvalidate).toHaveBeenCalledTimes(2)
	})

	test('update() leaves name and aliases untouched when incoming folds equal', async () => {
		mockFindOne
			.mockResolvedValueOnce(usCanonical)
			.mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		mockFind.mockResolvedValueOnce([usCanonical])
		helper.setData({ ...parsedAuthor, name: '  jason   p. anspach ' })

		await expect(helper.update()).resolves.toEqual({ data: parsedAuthor, modified: true })
		// Only the single update() write; no alias append
		expect(mockUpdateOne).toHaveBeenCalledTimes(1)
		// No alias write, so only the row update invalidates
		expect(mockInvalidate).toHaveBeenCalledTimes(1)
		expect(mockUpdateOne).toHaveBeenCalledWith(
			{ asin, $or: [{ region: { $exists: false } }, { region: 'us' }] },
			expect.objectContaining({
				$set: expect.objectContaining({ name: '  jason   p. anspach ' })
			})
		)
	})
})

describe('PaprAudibleAuthorHelper should catch error when', () => {
	test('create', async () => {
		mockInsertOne.mockRejectedValue(new Error('error'))
		helper.setData(parsedAuthor)
		await expect(helper.create()).rejects.toThrow(
			`An error occurred while creating author ${asin} in the DB`
		)
		expect(mockInvalidate).not.toHaveBeenCalled()
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
