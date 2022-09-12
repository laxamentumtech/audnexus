import { AudibleChapter } from '#config/typing/audible'
import ChapterHelper from '#helpers/books/audible/ChapterHelper'
import { ErrorMessageMissingEnv, ErrorMessageRequiredKey } from '#static/messages'
import { apiChapters, parsedChapters } from '#tests/datasets/helpers/chapters'

let asin: string
let helper: ChapterHelper

beforeEach(() => {
	asin = 'B079LRSMNN'
	// Set up helpers
	helper = new ChapterHelper(asin)
})

describe('ChapterHelper should', () => {
	test('setup constructor correctly', () => {
		expect(helper.asin).toBe(asin)
		expect(helper.adpToken).toBeDefined()
		expect(helper.privateKey).toBeDefined()
		expect(helper.reqUrl).toBe(
			`https://api.audible.com/1.0/content/${asin}/metadata?response_groups=chapter_info`
		)
	})

	test('build path', () => {
		expect(helper.buildPath()).toBe(`/1.0/content/${asin}/metadata?response_groups=chapter_info`)
	})

	test('cleanup chapter titles', () => {
		// Regular title isn't changed
		expect(helper.chapterTitleCleanup('Chapter 1')).toBe('Chapter 1')
		// Title with trailing period is changed
		expect(helper.chapterTitleCleanup('Chapter 1.')).toBe('Chapter 1')
		// Title with just a number is changed
		expect(helper.chapterTitleCleanup('123')).toBe('Chapter 123')
	})

	test('sign request', () => {
		expect(helper.signRequest(helper.adpToken, helper.privateKey)).toBeDefined()
	})

	test('fetch chapters', async () => {
		await expect(helper.fetchChapter()).resolves.toEqual(apiChapters)
	})

	test('return undefined if no chapters', async () => {
		asin = asin.slice(0, -1)
		helper = new ChapterHelper(asin)
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
})

describe('ChapterHelper should throw error when', () => {
	const OLD_ENV = process.env

	test('missing environment vars', () => {
		// Set environment variables
		process.env = { ...OLD_ENV }
		process.env.ADP_TOKEN = undefined
		process.env.PRIVATE_KEY = undefined
		// setup function to fail if environment variables are missing
		const bad_helper = function () {
			new ChapterHelper(asin)
		}
		expect(bad_helper).toThrowError(ErrorMessageMissingEnv('ADP_TOKEN or PRIVATE_KEY'))
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
		).rejects.toThrowError(ErrorMessageRequiredKey(asin, 'chapters', 'exist for chapter'))
	})
})
