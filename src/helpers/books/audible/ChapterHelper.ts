import {
	ApiChapter,
	ApiChapterSchema,
	ApiSingleChapter,
	AudibleChapter,
	AudibleChapterSchema,
	AudibleSingleChapter
} from '#config/types'
import fetch from '#helpers/utils/fetchPlus'
import SharedHelper from '#helpers/utils/shared'
import {
	ErrorMessageHTTPFetch,
	ErrorMessageNoData,
	ErrorMessageRequiredKey
} from '#static/messages'
import { regions } from '#static/regions'

class ChapterHelper {
	asin: string
	audibleResponse: AudibleChapter['content_metadata']['chapter_info'] | undefined
	requestUrl: string
	region: string

	constructor(asin: string, region: string) {
		this.asin = asin
		this.region = region
		const helper = new SharedHelper()
		const baseDomain = 'https://api.audible'
		const regionTLD = regions[region].tld
		const baseUrl = '1.0/content'
		const params = 'response_groups=chapter_info'
		this.requestUrl = helper.buildUrl(asin + '/metadata', baseDomain, regionTLD, baseUrl, params)
	}

	/**
	 * Performs various checks on chapter names and cleans them up
	 * @param {string} chapter
	 * @returns {string} cleaned chapter
	 */
	chapterTitleCleanup(chapter: string): string {
		const chapterNameLocale = regions[this.region].strings.chapterName
		// Starting chapter title data
		const originalTitle: string = chapter
		// Strip trailing periods
		const strippedTitle: string = originalTitle.replace(/\.$/, '')
		let chapterTitle = strippedTitle
		// Check if title is just numbers
		const isNotNumber = isNaN(Number(strippedTitle))
		if (!isNotNumber && strippedTitle.length <= 3) {
			// Remove trailing period in some cases
			const stripPeriod: string = strippedTitle
			// Convert to number to normalize numbers
			const numTitle: number = parseInt(stripPeriod)
			// Convert back to string for concat
			const strTitle: string = numTitle.toString()
			chapterTitle = `${chapterNameLocale} ${strTitle}`
		}

		return chapterTitle
	}

	/**
	 * Fetches chapter Audible API JSON
	 * @returns {Promise<AudibleChapter>} data from parseResponse() function.
	 */
	async fetchChapter(): Promise<AudibleChapter | undefined> {
		return fetch(this.requestUrl)
			.then(async (response) => {
				const json: AudibleChapter = response.data
				return json
			})
			.catch((error) => {
				console.log(ErrorMessageHTTPFetch(this.asin, error.status, 'chapters'))
				return undefined
			})
	}

	/**
	 * Compile the final data object.
	 * This is run after all other data has been parsed.
	 */
	getFinalData(): ApiChapter {
		if (!this.audibleResponse) throw new Error(ErrorMessageNoData(this.asin, 'ChapterHelper'))

		return ApiChapterSchema.parse({
			asin: this.asin,
			brandIntroDurationMs: this.audibleResponse.brandIntroDurationMs,
			brandOutroDurationMs: this.audibleResponse.brandOutroDurationMs,
			chapters: this.audibleResponse.chapters.map((chapter: AudibleSingleChapter) => {
				const chapJson: ApiSingleChapter = {
					lengthMs: chapter.length_ms,
					startOffsetMs: chapter.start_offset_ms,
					startOffsetSec: chapter.start_offset_sec,
					title: this.chapterTitleCleanup(chapter.title)
				}
				return chapJson
			}),
			isAccurate: this.audibleResponse.is_accurate,
			region: this.region,
			runtimeLengthMs: this.audibleResponse.runtime_length_ms,
			runtimeLengthSec: this.audibleResponse.runtime_length_sec
		})
	}

	/**
	 * Pareses fetched chapters from Audible API and cleaning up chapter titles
	 * @param {AudibleChapter} jsonResponse fetched json response from api.audible.com
	 * @returns {Promise<ApiChapter>} relevant data to keep
	 */
	async parseResponse(jsonResponse: AudibleChapter | undefined): Promise<ApiChapter | undefined> {
		// Base undefined check
		if (!jsonResponse?.content_metadata.chapter_info) {
			return undefined
		}

		// Parse response with zod
		const response = AudibleChapterSchema.safeParse(jsonResponse)
		// Handle error if response is not valid
		if (!response.success) {
			// Get the key 'path' from the first issue
			const issuesPath = response.error.issues[0].path
			// Get the last key from the path, which is the key that is missing
			const key = issuesPath[issuesPath.length - 1]
			// Throw error with the missing key
			throw new Error(ErrorMessageRequiredKey(this.asin, String(key), 'exist for chapter'))
		}

		// Set response to class variable on success
		this.audibleResponse = response.data.content_metadata.chapter_info

		return this.getFinalData()
	}

	/**
	 * Call functions in the class to parse final book JSON
	 * @returns {Promise<ApiChapter>}
	 */
	async process(): Promise<ApiChapter | undefined> {
		const chapterResponse = await this.fetchChapter()

		return this.parseResponse(chapterResponse)
	}
}

export default ChapterHelper
