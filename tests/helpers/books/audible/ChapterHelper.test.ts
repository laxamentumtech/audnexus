import type { AxiosResponse } from 'axios'
import type { FastifyBaseLogger } from 'fastify'

import type { AudibleChapter } from '#config/types'
import ChapterHelper from '#helpers/books/audible/ChapterHelper'
import { ContentTypeMismatchError } from '#helpers/errors/ApiErrors'
import * as fetchPlus from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'
import { regions } from '#static/regions'
import { apiChapters, parsedChapters } from '#tests/datasets/helpers/chapters'

jest.mock('#helpers/utils/fetchPlus')
jest.mock('#helpers/utils/shared')

// Save original environment variables to restore after each test
const ORIG_ENV = process.env

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
	url = `https://api.audible.com/1.0/content/${asin}/metadata?response_groups=chapter_info&quality=High`
	mockResponse = deepCopy(apiChapters)
	// Set up environment variables for ChapterHelper constructor
	process.env.ADP_TOKEN = 'mock_adp_token'
	// FAKE/MOCK RSA private key for testing only - NOT a real credential
	process.env.PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIICXQIBAAKBgQDWGw8THIbueiDYRczKw15iLGhwkOJ5mvO3b12lZJYNyAqmVKqo
I3So1xJZveKLFkdjK9tIJ9Y2jfsNSpPR0oZTTaGGVs6JejN6sPP8dq+RsNheL+No
Poi5ae5OtXst+09exHAK+Td5lD+jSPbpgH0z6H2Ymxkzcj/0nfncdotQJwIDAQAB
AoGAY7/ljQzcXFyv0rLqT4kn/usbmV4W9XrYkxyib3zmX/NT6txFSeKC5mqVFRRf
aFdv2OdE2WAd7/rD/RRCvB2uEGUX1Nbyhw0Fd04tfdOUW5xYvD4Ij62eQzM+/axB
fxRrudMK1ZLnHY6y1SVFdISgcOXBjzSnVp62VVtzPoHXLBkCQQD1L2JgKu0NLuNz
VJZa+3uCkzaozvQLPWlPJ181RKXvPtAMmqAFT/BRXp6IRt/jDVLYYeNI9cnCjOsA
4ztMMxNzAkEA34y6VseUezMwOZVFP9A7O9dufIz/mPA8KYx6+y1BaNS7opcs6R3J
nwlmJQj/XDchHAboL+I0jdxFdGcCyK+rfQJBAK5eVIgv/wYxInES5xstXlkueOD0
zXpw4kP4rC0l9RyAf1V3YfZlM3Oq5vPj87V19EUO2KU6p5JExZyL/c/jQyECQHTm
Y38DyPqP7xT9oQPYwVDuvCE3nmV8owlbI+h7ZuwJ6sEAawTQheG7iYWuadLwJUlB
t2Nq1+6jFFLll0gYzQUCQQDdosNVYv5LB4hPYbV4yQK90WIQmiFL3GBm0afQVcxy
wJhvGwWnOXbc/RAmdfeZH4H2XJCEZ/yzCG9d0XOpnyAZ
-----END RSA PRIVATE KEY-----`
	// Set up spys
	jest.spyOn(SharedHelper.prototype, 'buildUrl').mockReturnValue(url)
	jest
		.spyOn(fetchPlus, 'default')
		.mockImplementation(() => Promise.resolve({ data: mockResponse, status: 200 } as AxiosResponse))
	// Set up helpers
	helper = new ChapterHelper(asin, region)
})

afterEach(() => {
	// Restore environment variables to prevent cross-test leakage
	restoreEnv()
})

function restoreEnv() {
	process.env = { ...ORIG_ENV }
}

describe('ChapterHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.adpToken).toBeDefined()
		expect(helper.privateKey).toBeDefined()
		expect(helper.requestUrl).toBe(url)
	})

	test('build path', () => {
		expect(helper.buildPath()).toBe(
			`/1.0/content/${asin}/metadata?response_groups=chapter_info&quality=High`
		)
	})

	test('cleanup chapter titles', () => {
		// Regular title isn't changed
		expect(helper.chapterTitleCleanup('Chapter 1')).toBe('Chapter 1')
		// Title with trailing period is changed
		expect(helper.chapterTitleCleanup('Chapter 1.')).toBe('Chapter 1')
		// Title with just a number is changed
		expect(helper.chapterTitleCleanup('123')).toBe('Chapter 123')
		// Title with an underscore is changed
		expect(helper.chapterTitleCleanup('Chapter_1')).toBe('Chapter 1')
	})

	test('sign request', () => {
		expect(helper.signRequest(helper.adpToken, helper.privateKey)).toBeDefined()
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

	test('throw NotFoundError if no chapter data in region', async () => {
		await expect(helper.parseResponse(undefined)).rejects.toThrow(
			`Item not available in region '${region}' for ASIN: ${asin}`
		)
	})

	test('process', async () => {
		await expect(helper.process()).resolves.toEqual(parsedChapters)
	})

	test('process with valid contentType MultiPartBook', async () => {
		await expect(helper.process('MultiPartBook')).resolves.toEqual(parsedChapters)
	})

	test('process with valid contentType SinglePartBook', async () => {
		await expect(helper.process('SinglePartBook')).resolves.toEqual(parsedChapters)
	})

	test('validateContentType does not throw for valid MultiPartBook', () => {
		expect(() => helper.validateContentType('MultiPartBook')).not.toThrow()
	})

	test('validateContentType does not throw for valid SinglePartBook', () => {
		expect(() => helper.validateContentType('SinglePartBook')).not.toThrow()
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
		expect(() => helper.getFinalData()).toThrow('No input data')
	})

	const OLD_ENV = process.env

	test('missing environment vars', () => {
		// Set environment variables
		process.env = { ...OLD_ENV }
		process.env.ADP_TOKEN = undefined
		process.env.PRIVATE_KEY = undefined
		// setup function to fail if environment variables are missing
		const bad_helper = function () {
			new ChapterHelper(asin, region)
		}
		expect(bad_helper).toThrow('Missing environment variable(s): ADP_TOKEN or PRIVATE_KEY')
		// Restore environment
		process.env = OLD_ENV
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
		).rejects.toThrow(
			`Required key 'chapters' does not exist for chapter in Audible API response for ASIN ${asin}`
		)
	})
	// test('chapter has required keys and missing values', () => {
	// 	helper.inputJson = {
	// 		brandIntroDurationMs: '',
	// 		brandOutroDurationMs: 5062,
	// 		chapters: [
	// 			{
	// 				length_ms: 945561,
	// 				start_offset_ms: 22664,
	// 				start_offset_sec: 23,
	// 				title: '1'
	// 			}
	// 		],
	// 		is_accurate: true,
	// 		runtime_length_ms: 62548009,
	// 		runtime_length_sec: 62548
	// 	} as unknown as AudibleChapter['content_metadata']['chapter_info']
	// 	expect(helper.hasRequiredKeys()).toEqual({
	// 		isValid: false,
	// 		message:
	// 			"Required key 'brandIntroDurationMs' does not have a valid value in Audible API response for ASIN B079LRSMNN"
	// 	})
	// })
	test('error fetching Chapter data', async () => {
		const mockLogger = { error: jest.fn() }
		jest.spyOn(fetchPlus, 'default').mockImplementation(() =>
			Promise.reject({
				status: 403
			})
		)
		helper = new ChapterHelper(asin, region, mockLogger as unknown as FastifyBaseLogger)
		await expect(helper.fetchChapter()).resolves.toBeUndefined()
		expect(mockLogger.error).toHaveBeenCalledWith(
			`An error occured while fetching data from chapters. Response: 403, ASIN: ${asin}`
		)
	})

	test.each([
		['Podcast', 'Podcast'],
		[undefined, 'unknown'],
		['AudibleOriginal', 'AudibleOriginal']
	])('content type is invalid (%s)', (actualType, expectedActualType) => {
		try {
			helper.validateContentType(actualType)
			fail('Expected ContentTypeMismatchError to be thrown')
		} catch (error) {
			expect(error).toBeInstanceOf(ContentTypeMismatchError)
			expect((error as ContentTypeMismatchError).message).toBe(
				`Item is a ${expectedActualType}, not a book. ASIN: ${asin}`
			)
			expect((error as ContentTypeMismatchError).details).toEqual({
				asin: asin,
				requestedType: 'book',
				actualType: expectedActualType
			})
		}
	})
})
