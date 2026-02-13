jest.mock('#config/models/Author')
jest.mock('#helpers/utils/shared')

import type { FastifyBaseLogger } from 'fastify'
import { mock } from 'jest-mock-extended'

import AuthorModel, { AuthorDocument } from '#config/models/Author'
import { ApiQueryString } from '#config/types'
import * as checkers from '#config/typing/checkers'
import PaprAudibleAuthorHelper from '#helpers/database/papr/audible/PaprAudibleAuthorHelper'
import SharedHelper from '#helpers/utils/shared'
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
	asin = parsedAuthor.asin
	options = {
		region: 'us',
		update: '1'
	}
	helper = new PaprAudibleAuthorHelper(asin, options)

	jest.spyOn(AuthorModel, 'updateOne').mockResolvedValue({
		acknowledged: true,
		matchedCount: 1,
		modifiedCount: 1,
		upsertedCount: 0,
		upsertedId: authorWithoutProjection._id
	})
	jest.spyOn(AuthorModel, 'findOne').mockResolvedValue(authorWithoutProjection)
	jest.spyOn(AuthorModel, 'insertOne').mockResolvedValue(authorWithoutProjection)
	jest.spyOn(checkers, 'isAuthorDocument').mockReturnValue(true)
})

describe('PaprAudibleAuthorHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.options).toBe(options)
	})
	test('create', async () => {
		const obj = { data: parsedAuthor, modified: true }
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		helper.setData(parsedAuthor)

		await expect(helper.create()).resolves.toEqual(obj)
		expect(AuthorModel.insertOne).toHaveBeenCalledWith(parsedAuthor)
		expect(AuthorModel.findOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('delete', async () => {
		const obj = { data: { acknowledged: true, deletedCount: 1 }, modified: true }
		jest.spyOn(AuthorModel, 'deleteOne').mockResolvedValue(obj.data)
		await expect(helper.delete()).resolves.toEqual(obj)
		expect(AuthorModel.deleteOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findByName', async () => {
		helper = new PaprAudibleAuthorHelper('', { name: 'test', region: 'us' })
		const obj = { data: [{ asin: asin, name: 'test' }], modified: false }
		jest
			.spyOn(AuthorModel, 'find')
			.mockResolvedValue([{ asin: asin, name: 'test' }] as unknown as AuthorDocument[])
		await expect(helper.findByName()).resolves.toEqual(obj)
	})
	test('findOne', async () => {
		const obj = { data: authorWithoutProjection, modified: false }
		await expect(helper.findOne()).resolves.toEqual(obj)
		expect(AuthorModel.findOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOne returns null if it is not an AuthorDocument', async () => {
		const obj = { data: null, modified: false }
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValue(null)
		jest.spyOn(checkers, 'isAuthorDocument').mockReturnValue(false)
		await expect(helper.findOne()).resolves.toEqual(obj)
		expect(AuthorModel.findOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOneWithProjection', async () => {
		const obj = { data: parsedAuthor, modified: false }
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		await expect(helper.findOneWithProjection()).resolves.toEqual(obj)
		expect(AuthorModel.findOne).toHaveBeenCalledWith({
			asin: asin,
			$or: [{ region: { $exists: false } }, { region: options.region }]
		})
	})
	test('findOneWithProjection returns null if it is not an AuthorProfile', async () => {
		const obj = { data: null, modified: false }
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValue(null)
		await expect(helper.findOneWithProjection()).resolves.toEqual(obj)
		expect(AuthorModel.findOne).toHaveBeenCalledWith({
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
		jest
			.spyOn(AuthorModel, 'findOne')
			.mockResolvedValueOnce(parsedAuthor as unknown as AuthorDocument)
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValueOnce(authorWithoutProjection)
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		helper.setData(parsedAuthor)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate finds identical update data', async () => {
		const obj = { data: parsedAuthor, modified: false }
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		jest.spyOn(SharedHelper.prototype, 'isEqualData').mockReturnValue(true)
		helper.setData(parsedAuthor)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate needs to create', async () => {
		const obj = { data: parsedAuthor, modified: true }
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValueOnce(null)
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValue(authorWithoutProjection)
		helper.setData(parsedAuthor)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate difference in genres', async () => {
		const obj = { data: parsedAuthor, modified: true }
		jest.spyOn(SharedHelper.prototype, 'isEqualData').mockReturnValue(false)
		jest
			.spyOn(AuthorModel, 'findOne')
			.mockResolvedValueOnce(parsedAuthor as unknown as AuthorDocument)
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValueOnce(authorWithoutProjection)
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		helper.setData(parsedAuthor)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate genres on old, but not on new', async () => {
		const obj = { data: parsedAuthor, modified: false }
		jest.spyOn(SharedHelper.prototype, 'isEqualData').mockReturnValue(false)
		jest
			.spyOn(AuthorModel, 'findOne')
			.mockResolvedValueOnce(parsedAuthor as unknown as AuthorDocument)
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValueOnce(authorWithoutProjection)
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		helper.setData(parsedAuthorWithoutGenres)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate no genres on new or old', async () => {
		const obj = { data: parsedAuthorWithoutGenres, modified: false }
		jest.spyOn(SharedHelper.prototype, 'isEqualData').mockReturnValue(false)
		jest
			.spyOn(AuthorModel, 'findOne')
			.mockResolvedValueOnce(parsedAuthorWithoutGenres as unknown as AuthorDocument)
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValueOnce(authorWithoutGenresWithoutProjection)
		jest
			.spyOn(AuthorModel, 'findOne')
			.mockResolvedValue(parsedAuthorWithoutGenres as unknown as AuthorDocument)
		helper.setData(parsedAuthorWithoutGenres)
		await expect(helper.createOrUpdate()).resolves.toEqual(obj)
	})
	test('createOrUpdate logs info when updating', async () => {
		const mockLogger = mock<FastifyBaseLogger>()
		const helperWithLogger = new PaprAudibleAuthorHelper(asin, options, mockLogger)
		jest.spyOn(SharedHelper.prototype, 'isEqualData').mockReturnValue(false)
		jest
			.spyOn(AuthorModel, 'findOne')
			.mockResolvedValueOnce(parsedAuthor as unknown as AuthorDocument)
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValueOnce(authorWithoutProjection)
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		helperWithLogger.setData(parsedAuthor)
		await helperWithLogger.createOrUpdate()
		expect(mockLogger.info).toHaveBeenCalledWith(`Updating author ASIN ${asin}`)
	})
	test('update', async () => {
		const obj = { data: parsedAuthor, modified: true }
		helper.setData(parsedAuthor)
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValueOnce(authorWithoutProjection)
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValue(parsedAuthor as unknown as AuthorDocument)
		await expect(helper.update()).resolves.toEqual(obj)
		expect(AuthorModel.updateOne).toHaveBeenCalledWith(
			{ asin: asin, $or: [{ region: { $exists: false } }, { region: options.region }] },
			{
				$set: { ...parsedAuthor, createdAt: authorWithoutProjection._id.getTimestamp() },
				$currentDate: { updatedAt: true }
			}
		)
	})
})

describe('PaprAudibleAuthorHelper should catch error when', () => {
	test('create', async () => {
		jest.spyOn(AuthorModel, 'insertOne').mockRejectedValue(new Error('error'))
		helper.setData(parsedAuthor)
		await expect(helper.create()).rejects.toThrow(
			`An error occurred while creating author ${asin} in the DB`
		)
	})
	test('create logs error on failure', async () => {
		const mockLogger = mock<FastifyBaseLogger>()
		const helperWithLogger = new PaprAudibleAuthorHelper(asin, options, mockLogger)
		jest.spyOn(AuthorModel, 'insertOne').mockRejectedValue(new Error('DB error'))
		helperWithLogger.setData(parsedAuthor)
		await expect(helperWithLogger.create()).rejects.toThrow()
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})
	test('delete', async () => {
		jest.spyOn(AuthorModel, 'deleteOne').mockRejectedValue(new Error('error'))
		await expect(helper.delete()).rejects.toThrow(
			`An error occurred while deleting author ${asin} in the DB`
		)
	})
	test('delete logs error on failure', async () => {
		const mockLogger = mock<FastifyBaseLogger>()
		const helperWithLogger = new PaprAudibleAuthorHelper(asin, options, mockLogger)
		jest.spyOn(AuthorModel, 'deleteOne').mockRejectedValue(new Error('DB error'))
		await expect(helperWithLogger.delete()).rejects.toThrow()
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})
	test('findByName has no name', async () => {
		await expect(helper.findByName()).rejects.toThrow('Invalid search parameters')
	})
	test('update did not find existing', async () => {
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValueOnce(null)
		helper.setData(parsedAuthor)
		await expect(helper.update()).rejects.toThrow(
			`An error occurred while updating author ${asin} in the DB`
		)
	})
	test('update', async () => {
		jest.spyOn(AuthorModel, 'updateOne').mockRejectedValue(new Error('error'))
		helper.setData(parsedAuthor)
		await expect(helper.update()).rejects.toThrow(
			`An error occurred while updating author ${asin} in the DB`
		)
	})
	test('update logs error on failure', async () => {
		const mockLogger = mock<FastifyBaseLogger>()
		const helperWithLogger = new PaprAudibleAuthorHelper(asin, options, mockLogger)
		jest.spyOn(AuthorModel, 'findOne').mockResolvedValueOnce(authorWithoutProjection)
		jest.spyOn(AuthorModel, 'updateOne').mockRejectedValue(new Error('DB error'))
		helperWithLogger.setData(parsedAuthor)
		await expect(helperWithLogger.update()).rejects.toThrow()
		expect(mockLogger.error).toHaveBeenCalledWith('DB error')
	})
})
