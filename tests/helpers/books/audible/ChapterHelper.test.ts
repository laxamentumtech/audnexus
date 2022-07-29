import ChapterHelper from '#helpers/books/audible/ChapterHelper'
import { apiChapters, parsedChapters } from '#tests/datasets/helpers/chapters'

let helper: ChapterHelper

beforeEach(() => {
	// Set up helpers
	helper = new ChapterHelper('B079LRSMNN')
})

test('should setup constructor correctly', () => {
	expect(helper.asin).toBe('B079LRSMNN')
	expect(helper.adpToken).toBeDefined()
	expect(helper.privateKey).toBeDefined()
	expect(helper.reqUrl).toBe(
		'https://api.audible.com/1.0/content/B079LRSMNN/metadata?response_groups=chapter_info'
	)
})

test('should build path', () => {
	expect(helper.buildPath()).toBe('/1.0/content/B079LRSMNN/metadata?response_groups=chapter_info')
})

test('should cleanup chapter titles', () => {
	// Regular title isn't changed
	expect(helper.chapterTitleCleanup('Chapter 1')).toBe('Chapter 1')
	// Title with trailing period is changed
	expect(helper.chapterTitleCleanup('Chapter 1.')).toBe('Chapter 1')
	// Title with just a number is changed
	expect(helper.chapterTitleCleanup('123')).toBe('Chapter 123')
})

test('should sign request', () => {
	expect(helper.signRequest(helper.adpToken, helper.privateKey)).toBeDefined()
})

test('should fetch chapters', async () => {
	await expect(helper.fetchChapter()).resolves.toEqual(apiChapters)
})

test('should return undefined if no chapters', async () => {
	helper = new ChapterHelper('B079LRSMN')
	await expect(helper.fetchChapter()).resolves.toBeUndefined()
})

test('should parse response', async () => {
	const chapters = await helper.fetchChapter()
	await expect(helper.parseResponse(chapters)).resolves.toEqual(parsedChapters)
})

test('should return undefined if no dom for parse response', async () => {
	await expect(helper.parseResponse(undefined)).resolves.toBeUndefined()
})

test('should process', async () => {
	await expect(helper.process()).resolves.toEqual(parsedChapters)
})
