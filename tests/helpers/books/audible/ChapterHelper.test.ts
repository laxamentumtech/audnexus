import type { AxiosResponse } from 'axios'

import { AudibleChapter } from '#config/typing/audible'
import ChapterHelper from '#helpers/books/audible/ChapterHelper'
import * as fetchPlus from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'
import { regions } from '#static/regions'
import { apiChapters, parsedChapters } from '#tests/datasets/helpers/chapters'

jest.mock('#helpers/utils/fetchPlus')
jest.mock('#helpers/utils/shared')

let asin: string
let helper: ChapterHelper
let mockResponse: AudibleChapter
let region: string
let url: string
const deepCopy = (obj: unknown) => JSON.parse(JSON.stringify(obj))

beforeEach(() => {
	// Variables
	asin = 'B079LRSMNN'
	region = 'us'
	url = `https://api.audible.com/1.0/content/${asin}/metadata?response_groups=chapter_info`
	mockResponse = deepCopy(apiChapters)
	// Set up spys
	jest.spyOn(SharedHelper.prototype, 'buildUrl').mockReturnValue(url)
	jest
		.spyOn(fetchPlus, 'default')
		.mockImplementation(() => Promise.resolve({ data: mockResponse, status: 200 } as AxiosResponse))
	// Set up helpers
	helper = new ChapterHelper(asin, region)
})

describe('ChapterHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.reqUrl).toBe(url)
	})

	test('cleanup chapter titles', () => {
		// Regular title isn't changed
		expect(helper.chapterTitleCleanup('Chapter 1')).toBe('Chapter 1')
		// Title with trailing period is changed
		expect(helper.chapterTitleCleanup('Chapter 1.')).toBe('Chapter 1')
		// Title with just a number is changed
		expect(helper.chapterTitleCleanup('123')).toBe('Chapter 123')
	})

	test('fetch chapters', async () => {
		await expect(helper.fetchChapter()).resolves.toEqual(apiChapters)
	})

	test('return undefined if no chapters', async () => {
		asin = asin.slice(0, -1)
		jest
			.spyOn(fetchPlus, 'default')
			.mockImplementation(() => Promise.resolve({ data: undefined, status: 404 } as AxiosResponse))
		url = `https://api.audible.com/1.0/content/${asin}/metadata?response_groups=chapter_info`
		jest.spyOn(SharedHelper.prototype, 'buildUrl').mockReturnValue(url)
		helper = new ChapterHelper(asin, region)

		await expect(helper.fetchChapter()).resolves.toBeUndefined()
	})

	test('parse response', async () => {
		const chapters = await helper.fetchChapter()
		await expect(helper.parseResponse(chapters)).resolves.toEqual(parsedChapters)
	})

	test('return undefined if no dom for parse response', async () => {
		await expect(helper.parseResponse(undefined)).resolves.toBeUndefined()
	})

	test('process', async () => {
		await expect(helper.process()).resolves.toEqual(parsedChapters)
	})

	describe('handle region: ', () => {
		test.each(Object.keys(regions))('%s', (region) => {
			helper = new ChapterHelper(asin, region)
			expect(helper.chapterTitleCleanup('123')).toBe(`${regions[region].strings.chapterName} 123`)
		})
	})
})

describe('ChapterHelper should throw error when', () => {
	test('no input data', () => {
		expect(() => helper.hasRequiredKeys()).toThrowError('No input data')
		expect(() => helper.getFinalData()).toThrowError('No input data')
	})

	test('chapter missing required keys', async () => {
		await expect(
			helper.parseResponse({
				content_metadata: {
					chapter_info: {
						brandIntroDurationMs: 2043,
						brandOutroDurationMs: 5062,
						is_accurate: true,
						runtime_length_ms: 62548009,
						runtime_length_sec: 62548
					}
				},
				response_groups: ['chapter_info']
			} as AudibleChapter)
		).rejects.toThrowError(
			`Required key 'chapters' does not exist for chapter in Audible API response for ASIN ${asin}`
		)
	})
	test('chapter has required keys and missing values', () => {
		helper.inputJson = {
			brandIntroDurationMs: '',
			brandOutroDurationMs: 5062,
			chapters: [
				{
					length_ms: 945561,
					start_offset_ms: 22664,
					start_offset_sec: 23,
					title: '1'
				}
			],
			is_accurate: true,
			runtime_length_ms: 62548009,
			runtime_length_sec: 62548
		} as unknown as AudibleChapter['content_metadata']['chapter_info']
		expect(helper.hasRequiredKeys()).toEqual({
			isValid: false,
			message:
				"Required key 'brandIntroDurationMs' does not have a valid value in Audible API response for ASIN B079LRSMNN"
		})
	})
	test('error fetching Chapter data', async () => {
		// Mock Fetch to fail once
		jest.spyOn(fetchPlus, 'default').mockImplementation(() =>
			Promise.reject({
				status: 403
			})
		)
		jest.spyOn(global.console, 'log')
		await expect(helper.fetchChapter()).resolves.toBeUndefined()
		expect(console.log).toHaveBeenCalledWith(
			`An error occured while fetching data from chapters. Response: 403, ASIN: ${asin}`
		)
	})
})
