import ChapterHelper from '#helpers/books/audible/ChapterHelper'
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
